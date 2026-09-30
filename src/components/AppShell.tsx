// The top bar and the frame every signed-in screen sits in.

import { NavLink, Outlet } from 'react-router-dom';
import { APP } from '../config';
import { ROLE_LABELS } from '../backend/types';
import { InstallButton } from './InstallButton';
import { useApp } from '../state/AppContext';

export function AppShell() {
  const { user, isAdmin, isCloud, signOut } = useApp();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          {APP.brand} <span>{APP.suffix}</span>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Applications
          </NavLink>
          {isAdmin ? (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
              Admin
            </NavLink>
          ) : null}
        </nav>
        <div className="topbar-right">
          <InstallButton />
          {!isCloud ? (
            <span className="demo-pill" title="Nothing is saved to the cloud">
              Demo
            </span>
          ) : null}
          {user ? (
            <div className="whoami">
              <b>{user.displayName}</b>
              <span>{ROLE_LABELS[user.role]}</span>
            </div>
          ) : null}
          <button type="button" className="btn btn-small" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">
        {APP.brand} {APP.suffix} v{__APP_VERSION__} &middot; {APP.company}
      </footer>
    </div>
  );
}
