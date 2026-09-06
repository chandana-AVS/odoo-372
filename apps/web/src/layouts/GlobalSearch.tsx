import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarDays,
  FileText,
  Layers,
  type LucideIcon,
  Receipt,
  Search,
  Users,
  X,
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

/**
 * Application-wide search living in the header.
 *
 * It behaves like the per-page search bars — a real input you type into, with
 * matches dropping down beneath it — rather than opening a separate dialog.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const debounced = useDebounced(query, 200);
  const term = debounced.trim();

  const boxRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const isHr = can(...HR_ROLES);
  const isPayroll = can(...PAYROLL_ROLES);

  // Cmd/Ctrl+K focuses the field; "/" does too when not already typing.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const focus = () => {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      };
      if (key === 'k' && (e.metaKey || e.ctrlKey)) return focus();
      if (key === '/' && !e.metaKey && !e.ctrlKey) {
        const el = document.activeElement;
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement ||
          (el as HTMLElement | null)?.isContentEditable;
        if (!typing) focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Dismiss the dropdown on a click outside the box.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

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
    // One large page: results are filtered client-side and capped at 5.
    queryFn: () =>
      api.get<{ rows: any[] }>('/payslips?pageSize=200').then((r) => r.rows),
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
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
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

  // The panel only drops once there is genuinely something to show.
  const noResults = Boolean(term) && !loading && results.length === 0;
  const showPanel = open && (results.length > 0 || noResults);

  let lastGroup = '';

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        aria-label="Search the application"
        className={cn(
          'h-9 w-40 rounded-lg border border-line bg-surface pl-9 pr-8 text-sm text-ink',
          'placeholder:text-faint transition-colors hover:border-faint/50',
          'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
          'sm:w-56 lg:w-64',
        )}
      />
      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
        {loading ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="rounded text-faint transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>

      {showPanel && (
        <div
          ref={listRef}
          className={cn(
            'absolute right-0 z-40 mt-1.5 max-h-[70vh] overflow-y-auto overscroll-contain',
            'w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-1.5',
            'shadow-pop animate-fade-up',
          )}
        >
          {noResults && (
            <p className="px-3 py-4 text-center text-xs text-muted">
              No results for <span className="font-medium text-ink">{term}</span>
            </p>
          )}

          {results.map((result, index) => {
            const header = result.group !== lastGroup ? result.group : null;
            lastGroup = result.group;
            const Icon = result.icon;
            return (
              <React.Fragment key={result.id}>
                {header && (
                  <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
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
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
