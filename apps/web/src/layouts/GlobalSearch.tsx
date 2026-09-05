import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarDays,
  CornerDownLeft,
  FileText,
  Layers,
  type LucideIcon,
  Receipt,
  Search,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Spinner } from '../components/ui';
import { api, qs } from '../lib/api';
import { HR_ROLES, PAYROLL_ROLES, Role, useAuth } from '../lib/auth';
import { cn, money, shortDate } from '../lib/format';
import { haystack, matches, useDebounced } from '../lib/search';

interface Result {
  id: string;
  group: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: string;
  to: string;
  /** Employees render an avatar instead of the group icon. */
  avatar?: { firstName: string; lastName: string };
}

/** Pages reachable by name, so "payslips" jumps straight to the list. */
const PAGES: { label: string; to: string; icon: LucideIcon; roles?: Role[] }[] = [
  { label: 'Employees', to: '/employees', icon: Users },
  { label: 'Contracts', to: '/contracts', icon: FileText, roles: HR_ROLES },
  { label: 'Working Schedules', to: '/schedules', icon: CalendarClock, roles: HR_ROLES },
  { label: 'Attendance', to: '/attendance', icon: CalendarClock },
  { label: 'Time Off Requests', to: '/time-off/requests', icon: CalendarDays },
  { label: 'Time Off Allocations', to: '/time-off/allocations', icon: CalendarDays },
  { label: 'Time Off Types', to: '/time-off/types', icon: CalendarDays, roles: HR_ROLES },
  { label: 'Payroll Dashboard', to: '/payroll/dashboard', icon: Receipt, roles: PAYROLL_ROLES },
  { label: 'Payruns', to: '/payroll/payruns', icon: Receipt, roles: PAYROLL_ROLES },
  { label: 'Payslips', to: '/payroll/payslips', icon: FileText, roles: PAYROLL_ROLES },
  { label: 'Salary Structures', to: '/payroll/structures', icon: Layers, roles: PAYROLL_ROLES },
  { label: 'Salary Rules', to: '/payroll/rules', icon: Layers, roles: PAYROLL_ROLES },
  { label: 'User Management', to: '/admin/users', icon: Users, roles: ['ADMIN'] },
];

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false);

  // Cmd/Ctrl+K anywhere, and "/" when not already typing into a field.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (key === '/' && !e.metaKey && !e.ctrlKey) {
        const el = document.activeElement;
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement ||
          (el as HTMLElement | null)?.isContentEditable;
        if (!typing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-muted transition-colors hover:border-faint/50 hover:text-ink sm:w-56 sm:px-3"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden flex-1 text-left text-sm sm:block">Search…</span>
        <kbd className="hidden rounded border border-line bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-faint sm:block">
          ⌘K
        </kbd>
      </button>
      {open && <SearchPalette onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [query, setQuery] = React.useState('');
  const [cursor, setCursor] = React.useState(0);
  const debounced = useDebounced(query, 200);
  const term = debounced.trim();
  const listRef = React.useRef<HTMLDivElement>(null);

  const isHr = can(...HR_ROLES);
  const isPayroll = can(...PAYROLL_ROLES);

  // Employees are searched on the server — the endpoint already supports `q`.
  const employees = useQuery({
    queryKey: ['search', 'employees', term],
    queryFn: () => api.get<any[]>(`/employees${qs({ q: term })}`),
    enabled: term.length > 0,
  });

  // The remaining collections have no `q` param, so they are fetched once and
  // filtered in the browser. React Query keeps them cached across openings.
  const contracts = useQuery({
    queryKey: ['contracts', ''],
    queryFn: () => api.get<any[]>('/contracts'),
    enabled: term.length > 0 && isHr,
    staleTime: 60_000,
  });
  const payruns = useQuery({
    queryKey: ['payruns', ''],
    queryFn: () => api.get<any[]>('/payruns'),
    enabled: term.length > 0 && isPayroll,
    staleTime: 60_000,
  });
  const payslips = useQuery({
    queryKey: ['payslips', '', ''],
    queryFn: () => api.get<any[]>('/payslips'),
    enabled: term.length > 0 && isPayroll,
    staleTime: 60_000,
  });
  const structures = useQuery({
    queryKey: ['salary-structures'],
    queryFn: () => api.get<any[]>('/salary-structures'),
    enabled: term.length > 0 && isPayroll,
    staleTime: 60_000,
  });

  const loading =
    employees.isFetching ||
    contracts.isFetching ||
    payruns.isFetching ||
    payslips.isFetching ||
    structures.isFetching;

  const results = React.useMemo<Result[]>(() => {
    if (!term) return [];
    const out: Result[] = [];
    const take = <T,>(rows: T[] | undefined, limit = 5) => (rows ?? []).slice(0, limit);
    const hit = (row: unknown, fields?: (row: any) => unknown[]) =>
      matches(haystack(row, fields), term);

    for (const page of PAGES) {
      if (page.roles && !can(...page.roles)) continue;
      if (!matches(page.label.toLowerCase(), term)) continue;
      out.push({
        id: `page:${page.to}`,
        group: 'Pages',
        icon: page.icon,
        title: page.label,
        subtitle: page.to,
        to: page.to,
      });
    }

    for (const employee of take(employees.data)) {
      out.push({
        id: `employee:${employee.id}`,
        group: 'Employees',
        icon: Users,
        title: `${employee.firstName} ${employee.lastName}`,
        subtitle: employee.jobPosition?.name ?? employee.workEmail,
        meta: employee.code,
        to: `/employees/${employee.id}`,
        avatar: { firstName: employee.firstName, lastName: employee.lastName },
      });
    }

    for (const contract of take(
      contracts.data?.filter((row) =>
        hit(row, (c) => [c.reference, c.employee, c.status, c.salaryStructure?.name]),
      ),
    )) {
      out.push({
        id: `contract:${contract.id}`,
        group: 'Contracts',
        icon: FileText,
        title: contract.reference,
        subtitle: `${contract.employee.firstName} ${contract.employee.lastName}`,
        meta: money(contract.wage),
        to: `/contracts/${contract.id}`,
      });
    }

    for (const payrun of take(
      payruns.data?.filter((row) =>
        hit(row, (p) => [p.name, p.state, p.salaryStructure?.name, p.department?.name]),
      ),
    )) {
      out.push({
        id: `payrun:${payrun.id}`,
        group: 'Payruns',
        icon: Receipt,
        title: payrun.name,
        subtitle: `${shortDate(payrun.periodStart)} — ${shortDate(payrun.periodEnd)}`,
        meta: payrun.state,
        to: `/payroll/payruns/${payrun.id}`,
      });
    }

    for (const payslip of take(
      payslips.data?.filter((row) =>
        hit(row, (p) => [p.number, p.employee, p.state, p.payrun?.name]),
      ),
    )) {
      out.push({
        id: `payslip:${payslip.id}`,
        group: 'Payslips',
        icon: FileText,
        title: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
        subtitle: payslip.number,
        meta: money(payslip.netAmount),
        to: `/payroll/payslips/${payslip.id}`,
      });
    }

    for (const structure of take(
      structures.data?.filter((row) => hit(row, (s) => [s.name, s.code])),
    )) {
      out.push({
        id: `structure:${structure.id}`,
        group: 'Salary Structures',
        icon: Layers,
        title: structure.name,
        subtitle: structure.code,
        to: `/payroll/structures/${structure.id}`,
      });
    }

    return out;
  }, [term, can, employees.data, contracts.data, payruns.data, payslips.data, structures.data]);

  React.useEffect(() => setCursor(0), [term]);

  // Keep the highlighted row inside the scroll viewport.
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const go = React.useCallback(
    (result?: Result) => {
      if (!result) return;
      navigate(result.to);
      onClose();
    },
    [navigate, onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[cursor]);
    }
  };

  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-[12vh]">
      <div
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={onKeyDown}
        className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-fade-up"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employees, contracts, payruns, payslips, pages…"
            className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          />
          {loading && <Spinner />}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {!term && (
            <p className="px-3 py-8 text-center text-xs text-muted">
              Start typing to search across the whole application.
            </p>
          )}

          {term && !loading && results.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-muted">
              No results for “{term}”.
            </p>
          )}

          {results.map((result, index) => {
            const header = result.group !== lastGroup ? result.group : null;
            lastGroup = result.group;
            const Icon = result.icon;
            return (
              <React.Fragment key={result.id}>
                {header && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-faint">
                    {header}
                  </p>
                )}
                <button
                  data-index={index}
                  onClick={() => go(result)}
                  onMouseMove={() => setCursor(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                    index === cursor ? 'bg-brand-soft' : 'hover:bg-elevated',
                  )}
                >
                  {result.avatar ? (
                    <Avatar {...result.avatar} size="sm" />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-elevated text-faint">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{result.title}</span>
                    {result.subtitle && (
                      <span className="block truncate text-xs text-muted">
                        {result.subtitle}
                      </span>
                    )}
                  </span>
                  {result.meta && <Badge tone="neutral">{result.meta}</Badge>}
                  {index === cursor && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-faint">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
