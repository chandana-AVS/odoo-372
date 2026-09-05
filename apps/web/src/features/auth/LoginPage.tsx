import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Field, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const DEMO_ACCOUNTS = [
  ['payroll.manager@oxp.com', 'HR Payroll Manager'],
  ['payroll.user@oxp.com', 'HR Payroll User'],
  ['hr.manager@oxp.com', 'HR Manager'],
  ['employee@oxp.com', 'Employee'],
  ['admin@oxp.com', 'Admin'],
] as const;

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = React.useState('payroll.manager@oxp.com');
  const [password, setPassword] = React.useState('password123');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Live headline counts — hardcoding these left them stale as the data grew.
  const stats = useQuery({
    queryKey: ['auth', 'stats'],
    queryFn: () =>
      api.get<{ employees: number; salaryRules: number; payruns: number }>('/auth/stats'),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (user) return <Navigate to="/" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white dark:text-zinc-950">
              <LayoutGrid className="h-4.5 w-4.5" />
            </span>
            <span className="text-base font-semibold tracking-tight">
              PeoplePay<span className="text-brand">360</span>
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in to continue to your workspace.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Work Email" required>
              <Input
                type="email"
                autoComplete="username"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>

            <Field label="Password" required>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full justify-center"
              loading={busy}
            >
              Sign in
            </Button>
          </form>

          {/* Demo switcher — accounts come from the seed. */}
          <div className="mt-8 rounded-xl border border-line bg-surface p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
              Demo accounts · password123
            </p>
            <div className="space-y-0.5">
              {DEMO_ACCOUNTS.map(([demoEmail, role]) => (
                <button
                  key={demoEmail}
                  type="button"
                  onClick={() => {
                    setEmail(demoEmail);
                    setPassword('password123');
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-elevated"
                >
                  <span className="truncate text-muted">{demoEmail}</span>
                  <span className="ml-2 shrink-0 font-medium text-brand">{role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Brand panel — hidden on small screens where it would just cost scroll */}
      <div className="relative hidden overflow-hidden bg-brand lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.18),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-center px-14 text-white dark:text-zinc-950">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            One flow from employee master data to a paid payslip.
          </h2>
          <p className="mt-4 max-w-md text-sm opacity-80">
            Contracts, working schedules, attendance and leave all feed the payroll engine —
            so a payslip is computed from configuration, never hardcoded.
          </p>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
            {[
              [stats.data?.employees, 'Employees'],
              [stats.data?.salaryRules, 'Salary rules'],
              [stats.data?.payruns, 'Payruns'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-2xl font-semibold tabular">{value ?? '—'}</dt>
                <dd className="mt-0.5 text-xs opacity-75">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
