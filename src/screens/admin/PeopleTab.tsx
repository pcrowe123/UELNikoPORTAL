// Who may sign in to the portal, and which applications each person is given (D18).
//
// Inviting somebody is deliberately not done from the browser. Creating an account needs the
// service-role key, which never leaves the office PC, and a portal with a handful of tiles does
// not earn an Edge Function to hold it (D10). New people are invited with
// `node scripts/create-user.mjs`; this screen changes and deactivates the ones who exist.

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { STATUS_LABELS, visibleLinks } from '../../engine/links';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type PortalLink, type Role, type User } from '../../backend/types';
import { useApp } from '../../state/AppContext';

const ROLES: Role[] = ['admin', 'member'];

export function PeopleTab() {
  const { backend, user: me, isCloud } = useApp();
  const toast = useToast();

  const [people, setPeople] = useState<User[] | null>(null);
  const [links, setLinks] = useState<PortalLink[]>([]);

  /** The person whose access is being edited, with the tiles currently ticked. */
  const [editing, setEditing] = useState<{ person: User; chosen: Set<string> } | null>(null);
  /** The new-person form, open when it is not null. */
  const [inviting, setInviting] = useState<{
    email: string;
    displayName: string;
    role: Role;
    chosen: Set<string>;
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [rows, allLinks] = await Promise.all([backend.listUsers(), backend.listLinks(true)]);
      setPeople(rows);
      setLinks(allLinks);
    } catch (err) {
      toast.bad((err as Error).message);
    }
  }, [backend, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function change(person: User, patch: { role?: Role; isActive?: boolean }) {
    try {
      await backend.updateUser(person.id, patch);
      await reload();
      toast.good(`${person.displayName} updated.`);
    } catch (err) {
      toast.bad((err as Error).message);
    }
  }

  async function invite() {
    if (!inviting) return;
    const email = inviting.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setProblem('That is not an email address.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const { warning } = await backend.inviteUser({
        email,
        displayName: inviting.displayName,
        role: inviting.role,
        linkIds: [...inviting.chosen],
      });
      setInviting(null);
      await reload();
      if (warning) toast.bad(warning);
      else toast.good(`${email} has been invited. They will get an email with a link.`);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend(person: User) {
    try {
      await backend.resendInvite(person.id);
      toast.good(`A fresh link is on its way to ${person.email}.`);
    } catch (err) {
      toast.bad((err as Error).message);
    }
  }

  async function openAccess(person: User) {
    try {
      const granted = await backend.listAccessFor(person.id);
      setEditing({ person, chosen: new Set(granted) });
    } catch (err) {
      toast.bad((err as Error).message);
    }
  }

  async function saveAccess() {
    if (!editing) return;
    setBusy(true);
    try {
      await backend.setAccessFor(editing.person.id, [...editing.chosen]);
      toast.good(`${editing.person.displayName}'s applications saved.`);
      setEditing(null);
    } catch (err) {
      toast.bad((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Only invitation-only tiles are worth ticking: an "Everyone" tile is open to this person
  // whatever the box says, and showing it would suggest otherwise.
  const invitationTiles = visibleLinks(links, { includeRetired: true }).filter(
    (l) => l.accessMode === 'invite',
  );

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setProblem(null);
            setInviting({ email: '', displayName: '', role: 'member', chosen: new Set() });
          }}
        >
          Invite somebody
        </button>
        <span className="spacer" />
        <span className="muted small">
          {people?.length ?? 0} {people?.length === 1 ? 'person' : 'people'}
        </span>
      </div>

      {!isCloud ? (
        <div className="banner banner-warn">
          <b>Demo mode.</b> Inviting somebody here adds them to this browser only. No email is sent.
        </div>
      ) : null}

      {people === null ? <p className="muted">Loading…</p> : null}

      {people !== null && people.length === 0 ? (
        <div className="empty">Nobody yet. Invite the first administrator with the command above.</div>
      ) : null}

      {people && people.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Account</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const isMe = person.id === me?.id;
                  return (
                    <tr key={person.id}>
                      <td>
                        <b>{person.displayName}</b>
                        {isMe ? <span className="pill pill-info" style={{ marginLeft: 6 }}>You</span> : null}
                      </td>
                      <td className="small">{person.email}</td>
                      <td>
                        <select
                          value={person.role}
                          aria-label={`Role for ${person.displayName}`}
                          // Nobody changes their own role. The database refuses it too, in
                          // protect_profile() - this only saves them the error message.
                          disabled={isMe}
                          onChange={(e) => void change(person, { role: e.target.value as Role })}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <div className="tiny muted">{ROLE_DESCRIPTIONS[person.role]}</div>
                      </td>
                      <td>
                        <span className={person.isActive ? 'pill pill-ok' : 'pill pill-error'}>
                          {person.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="right nowrap">
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={person.role === 'admin'}
                          title={
                            person.role === 'admin'
                              ? 'Administrators can open everything.'
                              : 'Choose which applications this person may open'
                          }
                          onClick={() => void openAccess(person)}
                        >
                          Applications
                        </button>{' '}
                        <button
                          type="button"
                          className={person.isActive ? 'btn btn-small btn-danger' : 'btn btn-small'}
                          disabled={isMe}
                          title={isMe ? 'You cannot deactivate your own account.' : undefined}
                          onClick={() => void change(person, { isActive: !person.isActive })}
                        >
                          {person.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-small"
                          title="Send them a fresh link to set their password"
                          onClick={() => void resend(person)}
                        >
                          Resend link
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="tiny muted">
        Deactivating somebody stops them signing in to the portal. It does not touch their accounts
        on the applications themselves — those are cancelled in each application separately.
      </p>

      {inviting ? (
        <Modal
          title="Invite somebody"
          onClose={() => setInviting(null)}
          footer={
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void invite()}>
                {busy ? 'Sending…' : 'Send the invitation'}
              </button>
              <button type="button" className="btn" onClick={() => setInviting(null)}>
                Cancel
              </button>
            </>
          }
        >
          {problem ? <div className="banner banner-error">{problem}</div> : null}

          <div className="field">
            <label htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={inviting.email}
              onChange={(e) => setInviting({ ...inviting, email: e.target.value })}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="invite-name">Their name</label>
            <input
              id="invite-name"
              type="text"
              value={inviting.displayName}
              onChange={(e) => setInviting({ ...inviting, displayName: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={inviting.role}
              onChange={(e) => setInviting({ ...inviting, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="tiny muted" style={{ marginTop: 4 }}>
              {ROLE_DESCRIPTIONS[inviting.role]}
            </p>
          </div>

          {inviting.role === 'member' && invitationTiles.length > 0 ? (
            <div className="field">
              <label>Applications to give them now</label>
              {invitationTiles.map((link) => (
                <label className="check" key={link.id}>
                  <input
                    type="checkbox"
                    checked={inviting.chosen.has(link.id)}
                    onChange={(e) => {
                      const chosen = new Set(inviting.chosen);
                      if (e.target.checked) chosen.add(link.id);
                      else chosen.delete(link.id);
                      setInviting({ ...inviting, chosen });
                    }}
                  />
                  <span className="swatch" style={{ background: link.colour }} />
                  {link.name}
                </label>
              ))}
              <p className="tiny muted" style={{ marginTop: 4, marginBottom: 0 }}>
                Only invitation-only applications are listed. Everything else is open to them
                already. You can change this afterwards with the <b>Applications</b> button.
              </p>
            </div>
          ) : null}

          <p className="tiny muted" style={{ marginBottom: 0 }}>
            They get an email with a link and choose their own password. Nobody here ever knows it.
          </p>
        </Modal>
      ) : null}

      {editing ? (
        <Modal
          title={`Applications for ${editing.person.displayName}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveAccess()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </>
          }
        >
          {invitationTiles.length === 0 ? (
            <p>
              No application is set to <b>By invitation</b> yet, so everyone can open all of them.
              Change an application's <b>Who may open it</b> setting on the Applications tab and it
              will appear here.
            </p>
          ) : (
            <>
              <p className="muted small">
                Tick what {editing.person.displayName.split(/\s+/)[0]} may open. Anything left
                unticked is shown padlocked rather than hidden, so they can see it exists and ask.
              </p>
              {invitationTiles.map((link) => (
                <label className="check" key={link.id}>
                  <input
                    type="checkbox"
                    checked={editing.chosen.has(link.id)}
                    onChange={(e) => {
                      const chosen = new Set(editing.chosen);
                      if (e.target.checked) chosen.add(link.id);
                      else chosen.delete(link.id);
                      setEditing({ ...editing, chosen });
                    }}
                  />
                  <span className="swatch" style={{ background: link.colour }} />
                  {link.name}
                  {link.status !== 'live' ? (
                    <span className="pill" style={{ marginLeft: 6 }}>
                      {STATUS_LABELS[link.status]}
                    </span>
                  ) : null}
                </label>
              ))}
            </>
          )}

          <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
            This changes what the portal shows, not what the application allows. Each one still has
            its own login, and that is what actually decides who gets in.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
