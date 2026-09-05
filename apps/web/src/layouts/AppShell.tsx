import {
  ChevronDown,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  Sun,
  Users,
  X,
} from 'lucide-react';
import * as React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar, Button } from '../components/ui';
import { cn } from '../lib/format';
import { HR_ROLES, PAYROLL_ROLES, Role, useAuth } from '../lib/auth';
import { AttendanceWidget } from './AttendanceWidget';
import { GlobalSearch } from './GlobalSearch';

interface NavItem {
  label: string;
  to?: string;
  roles?: Role[];
  children?: { label: string; to: string; roles?: Role[] }[];
}

/**
 * Mockup constraint: Requests / Allocations / Types are reachable ONLY from the
 * "Time Off" dropdown — never as their own top-level buttons. Same for Payroll.
 */
const NAV: NavItem[] = [
  { label: 'Employees', to: '/employees' },
  {
    label: 'Contracts',
    roles: HR_ROLES,
    children: [
      { label: 'Contracts', to: '/contracts' },
      { label: 'Working Schedules', to: '/schedules' },
    ],
  },
  {
    label: 'Attendance',
    children: [
      { label: 'Attendance Log', to: '/attendance' },
      { label: 'Attendance Requests', to: '/attendance/requests', roles: HR_ROLES },
    ],
  },
  {
    label: 'Time Off',
    children: [
      { label: 'Requests', to: '/time-off/requests' },
      { label: 'Allocations', to: '/time-off/allocations' },
      { label: 'Time Off Types', to: '/time-off/types', roles: HR_ROLES },
    ],
  },
  {
    label: 'Payroll',
    roles: PAYROLL_ROLES,
    children: [
      { label: 'Dashboard', to: '/payroll/dashboard' },
      { label: 'Payruns', to: '/payroll/payruns' },
      { label: 'Payslips', to: '/payroll/payslips' },
      { label: 'Salary Structures', to: '/payroll/structures' },
      { label: 'Salary Rules', to: '/payroll/rules' },
    ],
  },
];

function useTheme() {
  const [dark, setDark] = React.useState(() => {
    try {
      const stored = localStorage.getItem('pp360.theme');
      if (stored) return stored === 'dark';
    } catch {
      /* storage unavailable */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('pp360.theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);

  return [dark, setDark] as const;
}

function Dropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();
  const ref = React.useRef<HTMLDivElement>(null);
  const { can } = useAuth();

  const children = (item.children ?? []).filter((c) => !c.roles || can(...c.roles));
  const active = children.some((c) => location.pathname.startsWith(c.to));

  React.useEffect(() => setOpen(false), [location.pathname]);
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!children.length) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors',
          active ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:bg-elevated hover:text-ink',
        )}
      >
        {item.label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1.5 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-pop animate-fade-up">
          {children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                cn(
                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-soft font-medium text-brand-ink'
                    : 'text-muted hover:bg-elevated hover:text-ink',
                )
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user, logout, can } = useAuth();
  const [dark, setDark] = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const visibleNav = NAV.filter((item) => !item.roles || can(...item.roles));

  return (
    <div className="min-h-screen bg-bg">
      {/* ------------------------------------------------------------ top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4.5 w-4.5" />
          </Button>

          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white dark:text-zinc-950">
              <LayoutGrid className="h-4 w-4" />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight sm:block">
              PeoplePay<span className="text-brand">360</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
            {visibleNav.map((item) =>
              item.children ? (
                <Dropdown key={item.label} item={item} />
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to!}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-soft text-brand-ink'
                        : 'text-muted hover:bg-elevated hover:text-ink',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />

            <AttendanceWidget />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDark(!dark)}
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* Account menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg p-0.5 pr-1 transition-colors hover:bg-elevated"
              >
                <Avatar
                  firstName={user?.employee?.firstName ?? user?.email}
                  lastName={user?.employee?.lastName}
                  size="sm"
                />
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted sm:block" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-pop animate-fade-up">
                  <div className="border-b border-line px-3 py-2.5">
                    <p className="truncate text-sm font-medium">
                      {user?.employee
                        ? `${user.employee.firstName} ${user.employee.lastName}`
                        : 'Administrator'}
                    </p>
                    <p className="truncate text-xs text-muted">{user?.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {user?.roles.map((role) => (
                        <span
                          key={role}
                          className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-ink"
                        >
                          {role.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>

                  {can('ADMIN') && (
                    <Link
                      to="/admin/users"
                      className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-ink"
                    >
                      <Users className="h-3.5 w-3.5" />
                      User Management
                    </Link>
                  )}

                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------- mobile nav sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <nav className="relative flex h-full w-[82%] max-w-xs flex-col overflow-y-auto border-r border-line bg-surface animate-slide-in">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="text-sm font-semibold">
                PeoplePay<span className="text-brand">360</span>
              </span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 space-y-4 p-3">
              {visibleNav.map((item) => (
                <div key={item.label}>
                  {item.children ? (
                    <>
                      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                        {item.label}
                      </p>
                      <div className="space-y-0.5">
                        {item.children
                          .filter((c) => !c.roles || can(...c.roles))
                          .map((child) => (
                            <NavLink
                              key={child.to}
                              to={child.to}
                              className={({ isActive }) =>
                                cn(
                                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                                  isActive
                                    ? 'bg-brand-soft font-medium text-brand-ink'
                                    : 'text-muted hover:bg-elevated',
                                )
                              }
                            >
                              {child.label}
                            </NavLink>
                          ))}
                      </div>
                    </>
                  ) : (
                    <NavLink
                      to={item.to!}
                      className={({ isActive }) =>
                        cn(
                          'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-soft text-brand-ink'
                            : 'text-muted hover:bg-elevated',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  )}
                </div>
              ))}
            </div>
          </nav>
        </div>
      )}

      {/* -------------------------------------------------------------- page */}
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
