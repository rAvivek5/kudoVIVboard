import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/hooks/useToast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { FullPageLoader } from '@/components/common/Loader';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

// Route-level splitting: a guest opening a board never downloads the admin bundle.
const LandingPage = lazy(() => import('@/pages/public/LandingPage'));
const BoardPage = lazy(() => import('@/pages/public/BoardPage'));
const PrintBoardPage = lazy(() => import('@/pages/public/PrintBoardPage'));
const NotFoundPage = lazy(() => import('@/pages/public/NotFoundPage'));
const LoginPage = lazy(() => import('@/pages/admin/LoginPage'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'));
const BoardsPage = lazy(() => import('@/pages/admin/BoardsPage'));
const NewBoardPage = lazy(() => import('@/pages/admin/NewBoardPage'));
const BoardDetailPage = lazy(() => import('@/pages/admin/BoardDetailPage'));
const SearchPage = lazy(() => import('@/pages/admin/SearchPage'));

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={<FullPageLoader />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/b/:slug" element={<BoardPage />} />
                <Route path="/b/:slug/print" element={<PrintBoardPage />} />
                {/* Legacy-friendly alias so /board/:slug links keep working. */}
                <Route path="/board/:slug" element={<BoardPage />} />

                <Route path="/admin/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="boards" element={<BoardsPage />} />
                    <Route path="boards/new" element={<NewBoardPage />} />
                    <Route path="boards/:id" element={<BoardDetailPage />} />
                    <Route path="search" element={<SearchPage />} />
                  </Route>
                </Route>

                <Route path="/404" element={<NotFoundPage />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
