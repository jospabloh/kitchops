import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-steel-high border-t-copper" />
  </div>
);

// Guards the authenticated area of the app (Module 10). Mirrors stockflow's
// ProtectedRoute.jsx — the portfolio's reference pattern — which App.jsx was
// missing entirely: this file existed as unused Base44-scaffold boilerplate
// (never imported anywhere), so App.jsx rendered the full route tree
// unconditionally regardless of isAuthenticated. A visitor with no valid
// Base44 session (or a stale one) saw the app shell, not a login screen.
//
// Unauthenticated visitors are redirected to the in-app /login page,
// remembering where they were headed. `user_not_registered` is handled one
// level up in App.jsx, before this component ever mounts.
export default function ProtectedRoute() {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings } = useAuth();
  const location = useLocation();

  if (isLoadingAuth || isLoadingPublicSettings) {
    return <Spinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
