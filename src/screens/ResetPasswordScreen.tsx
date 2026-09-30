// Setting a new password, reached from the link in the invitation or reset email.
//
// Supabase puts a recovery session in place before this screen mounts, which is why the
// PASSWORD_RECOVERY event is latched in the backend and replayed here.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP } from '../config';
import { useApp } from '../state/AppContext';

const MINIMUM = 10;

export function ResetPasswordScreen() {
  const { backend } = useApp();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MINIMUM) {
      setFailure(`Use at least ${MINIMUM} characters.`);
      return;
    }
    if (password !== again) {
      setFailure('The two passwords are not the same.');
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await backend.setPassword(password);
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand big">
          {APP.brand} <span>{APP.suffix}</span>
        </div>
        <p className="muted small">Choose a password for the portal.</p>

        {done ? (
          <div className="banner banner-ok">That is set. Taking you to the applications…</div>
        ) : (
          <>
            {failure ? <div className="banner banner-error">{failure}</div> : null}
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
                <p className="tiny muted" style={{ marginTop: 4 }}>
                  At least {MINIMUM} characters. A few unrelated words is both stronger and easier to
                  remember than one word with symbols in it. Do not reuse the password from any of
                  the applications the portal links to.
                </p>
              </div>
              <div className="field">
                <label htmlFor="again">And again</label>
                <input
                  id="again"
                  type="password"
                  autoComplete="new-password"
                  value={again}
                  onChange={(e) => setAgain(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Saving…' : 'Set my password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
