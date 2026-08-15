import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { FullPageLoader } from '@/components/common/Loader';

/**
 * Guards the admin tree. This is a UX gate only — the real enforcement is the
 * RLS policies, which call is_admin() on every write.
 */
export function ProtectedRoute() {
  const { isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader label="Checking access" />;
  if (!isAdmin) return <Navigate to="/admin/login" state={{ from: location }} replace />;
  return <Outlet />;
}
