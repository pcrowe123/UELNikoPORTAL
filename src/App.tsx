// The routes, and the guard on them.
//
// The guard is cosmetic: it makes the app pleasant, not safe. Row Level Security in Postgres is
// what actually decides who may do what (CLAUDE.md rule 5).

import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AdminScreen } from './screens/AdminScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { useApp } from './state/AppContext';

function RequireAuth({ children, admin }: { children: ReactElement; admin?: boolean }) {
  const { user, loading, isAdmin } = useApp();
  const location = useLocation();

  if (loading) {
    return (
      <div className="screen">
        <p className="muted" style={{ padding: 24 }}>
          Loading…
        </p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

/**
 * Supabase fires PASSWORD_RECOVERY before any screen has mounted, so the backend latches it and
 * this replays it as a redirect wherever the person happens to be.
 */
function RecoveryRedirect() {
  const { backend } = useApp();
  const navigate = useNavigate();

  useEffect(
    () => backend.onPasswordRecovery(() => navigate('/reset-password', { replace: true })),
    [backend, navigate],
  );
  return null;
}

export function App() {
  return (
    <>
      <RecoveryRedirect />
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/reset-password" element={<ResetPasswordScreen />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<HomeScreen />} />
          <Route
            path="/admin"
            element={
              <RequireAuth admin>
                <AdminScreen />
              </RequireAuth>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
