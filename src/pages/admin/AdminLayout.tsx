import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Moon, Plus, Search, Sun, Grid3x3 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/hooks/useDarkMode';
import { Avatar } from '@/components/common/Avatar';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/boards', label: 'Boards', icon: Grid3x3, end: false },
  { to: '/admin/search', label: 'Search', icon: Search, end: false },
];

export default function AdminLayout() {
  const { admin, logOut } = useAuth();
  const { dark, toggle } = useDarkMode();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <NavLink to="/admin" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl border-2 border-ink bg-zap text-lg shadow-pop-sm">
              📌
            </span>
            <span className="hidden font-display text-lg font-extrabold sm:block">Hypewall</span>
          </NavLink>

          <nav className="ml-2 flex gap-1" aria-label="Admin sections">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[13px] font-semibold transition-colors',
                    isActive ? 'border-2 border-ink bg-ink text-paper' : 'hover:bg-ink/10',
                  )
                }
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => navigate('/admin/boards/new')}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-ink bg-hype px-3.5 font-display text-[13px] font-semibold text-white shadow-pop-sm sticker-lift"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New board</span>
            </button>

            <button
              onClick={toggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-card shadow-pop-sm sticker-lift"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {admin && <Avatar name={admin.displayName || admin.email} size="sm" />}

            <button
              onClick={() => void logOut().then(() => navigate('/admin/login'))}
              aria-label="Sign out"
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-card shadow-pop-sm sticker-lift"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
