// Signing in. Email and password, no signup page - an administrator invites people (D4).

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP } from '../config';
import { useApp } from '../state/AppContext';

export function LoginScreen() {
  const { backend, isCloud } = useApp();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      if (forgot) {
        await backend.sendPasswordReset(email);
        setSentTo(email);
        setForgot(false);
      } else {
        await backend.signIn(email, password);
        navigate('/', { replace: true });
      }
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
        <p className="muted small">One way in to every UEL / Niko application.</p>

        {!isCloud ? (
          <div className="banner banner-warn">
            <b>Demo mode.</b> No cloud project is configured, so nothing is saved anywhere but this
            browser. Sign in with anything.
          </div>
        ) : null}

        {sentTo ? (
          <div className="banner banner-ok">
            If <b>{sentTo}</b> has an account, a link to set a new password is on its way from{' '}
            {APP.authEmailFrom}.
          </div>
        ) : null}

        {failure ? <div className="banner banner-error">{failure}</div> : null}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          {!forgot ? (
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Just a moment…' : forgot ? 'Send me a link' : 'Sign in'}
          </button>
        </form>

        <p className="small" style={{ marginTop: 14, marginBottom: 0 }}>
          <button
            type="button"
            className="link"
            onClick={() => {
              setForgot(!forgot);
              setFailure(null);
            }}
          >
            {forgot ? 'Back to signing in' : 'I have forgotten my password'}
          </button>
        </p>

        <p className="tiny muted" style={{ marginTop: 16, marginBottom: 0 }}>
          This account is for the portal itself. Each application still asks you to sign in to it
          separately. Accounts are created by an administrator; if you have not got one, ask.
        </p>
      </div>
    </div>
  );
}
