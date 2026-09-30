// Who may sign in to the portal, and which applications each person is given (D18).
//
// Inviting somebody is deliberately not done from the browser. Creating an account needs the
// service-role key, which never leaves the office PC, and a portal with a handful of tiles does
// not earn an Edge Function to hold it (D10). New people are invited with
// `node scripts/create-user.mjs`; this screen changes and deactivates the ones who exist.

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { visibleLinks } from '../../engine/links';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type PortalLink, type Role, type User } from '../../backend/types';
import { useApp } from '../../state/AppContext';

const ROLES: Role[] = ['admin', 'member'];

export function PeopleTab() {
  const { backend, user: me } = useApp();
  const toast = useToast();

  const [people, setPeople] = useState<User[] | null>(null);
  const [links, setLinks] = useState<PortalLink[]>([]);

  /** The person whose access is being edited, with the tiles currently ticked. */
  const [editing, setEditing] = useState<{ person: User; chosen: Set<string> } | null>(null);
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
  const invitationTiles = visibleLinks(links, { includeHidden: true }).filter(
    (l) => l.accessMode === 'invite',
  );

  return (
    <div>
      <div className="banner">
        To add somebody, run this on the office PC:
        <br />
        <code className="mono small">
          node scripts/create-user.mjs --email them@uel.ie --name "Their Name" --role member
        </code>
        <br />
        They are emailed a link and choose their own password. Nobody here ever knows it.
      </div>

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
                  {!link.isActive ? <span className="pill" style={{ marginLeft: 6 }}>Hidden</span> : null}
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
