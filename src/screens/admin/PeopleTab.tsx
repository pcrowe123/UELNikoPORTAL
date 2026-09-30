// Who may sign in to the portal.
//
// Inviting somebody is deliberately not done from the browser. Creating an account needs the
// service-role key, which never leaves the office PC, and a portal with six tiles does not earn an
// Edge Function to hold it (D10). New people are invited with
// `node scripts/create-user.mjs`; this screen changes and deactivates the ones who exist.

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role, type User } from '../../backend/types';
import { useApp } from '../../state/AppContext';

const ROLES: Role[] = ['admin', 'member'];

export function PeopleTab() {
  const { backend, user: me } = useApp();
  const toast = useToast();

  const [people, setPeople] = useState<User[] | null>(null);

  const reload = useCallback(async () => {
    try {
      setPeople(await backend.listUsers());
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
    </div>
  );
}
