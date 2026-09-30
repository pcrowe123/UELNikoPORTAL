// Who opened what, and when. Dublin local time, dd/MM/yyyy, 24-hour clock (CLAUDE.md rule 7).
//
// This is the portal's only security value beyond the login itself: it says which accounts are
// being used and which applications people actually reach for (SE-03).

import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import type { AuditEntry } from '../../backend/types';
import { useApp } from '../../state/AppContext';

const WHEN = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function ActivityTab() {
  const { backend } = useApp();
  const toast = useToast();

  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    void backend
      .listAudit(200)
      .then((rows) => {
        if (live) setEntries(rows);
      })
      .catch((err: Error) => {
        if (live) toast.bad(err.message);
      });
    return () => {
      live = false;
    };
  }, [backend, toast]);

  return (
    <div>
      {entries === null ? <p className="muted">Loading…</p> : null}

      {entries !== null && entries.length === 0 ? (
        <div className="empty">Nothing recorded yet.</div>
      ) : null}

      {entries && entries.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Which</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="small nowrap">{WHEN.format(new Date(e.at))}</td>
                    <td className="small">{e.actorName ?? '(account since removed)'}</td>
                    <td className="small">{e.action === 'launch' ? 'Opened' : e.action}</td>
                    <td className="small mono">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="tiny muted">
        The most recent 200 entries. A launch is recorded as a courtesy, not a guarantee — opening a
        tile with the middle mouse button or a copied address may not be counted.
      </p>
    </div>
  );
}
