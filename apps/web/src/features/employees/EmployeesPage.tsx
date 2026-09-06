import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Plus, Users } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  SearchInput,
  Select,
  Td,
  Th,
  TableWrap,
  Tr,
} from '../../components/ui';
import { api, qs } from '../../lib/api';
import { HR_ROLES, useAuth } from '../../lib/auth';
import { cn, titleCase } from '../../lib/format';
import { EmployeeEditor } from './EmployeeEditor';

interface EmployeeRow {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  employeeType: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
  avatarUrl?: string | null;
  isActive: boolean;
  department: { id: string; name: string } | null;
  jobPosition: { name: string } | null;
  manager: { firstName: string; lastName: string } | null;
  workingSchedule: { name: string } | null;
}

/**
 * Shared pager for both employee views. Kept local to this page — it reads the
 * already-fetched list, so there is no server round-trip when changing page.
 */
function EmployeePager({
  page,
  pageCount,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted">
        Showing{' '}
        <span className="font-medium tabular text-ink">
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
        </span>{' '}
        of <span className="font-medium tabular text-ink">{total}</span> employees
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Button>
        <span className="tabular text-xs text-muted">
          Page {page} of {pageCount}
        </span>
        <Button
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function EmployeesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCreate = can(...HR_ROLES);
  const [creating, setCreating] = React.useState(false);
  const [view, setView] = React.useState<'kanban' | 'list'>(() => {
    try {
      return (localStorage.getItem('pp360.employeeView') as 'kanban' | 'list') ?? 'kanban';
    } catch {
      return 'kanban';
    }
  });
  const [q, setQ] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [employeeType, setEmployeeType] = React.useState('');

  React.useEffect(() => {
    try {
      localStorage.setItem('pp360.employeeView', view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // Debounce the search so typing doesn't hammer the API.
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/departments'),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['employees', debounced, departmentId, employeeType],
    queryFn: () =>
      api.get<EmployeeRow[]>(`/employees${qs({ q: debounced, departmentId, employeeType })}`),
  });

  /** List view pages at 20; kanban shows every card. */
  const PAGE_SIZE = 20;
  const [page, setPage] = React.useState(1);

  const pageCount = Math.max(Math.ceil((data?.length ?? 0) / PAGE_SIZE), 1);
  // Clamp rather than reset: deleting the last row of page 9 should land on 8,
  // not throw the user back to the beginning.
  const currentPage = Math.min(page, pageCount);
  const pageRows = (data ?? []).slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // Any filter change makes the old page number meaningless.
  React.useEffect(() => setPage(1), [q, departmentId, employeeType, view]);

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="The central hub — open anyone to reach their contracts, attendance and time off."
        action={
          <>
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              {(
                [
                  ['kanban', LayoutGrid],
                  ['list', List],
                ] as const
              ).map(([mode, Icon]) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  aria-label={`${mode} view`}
                  className={cn(
                    'flex h-8 w-9 items-center justify-center rounded-md transition-colors',
                    view === mode
                      ? 'bg-brand-soft text-brand-ink'
                      : 'text-muted hover:bg-elevated hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            {canCreate && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Employee
              </Button>
            )}
          </>
        }
      />

      {/* Filters */}
      <Card className="mb-5 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={q}
            onChange={setQ}
            count={data?.length}
            placeholder="Search name, code or email…"
            className="lg:col-span-2"
          />
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All Departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={employeeType} onChange={(e) => setEmployeeType(e.target.value)}>
            <option value="">All Types</option>
            <option value="FULL_TIME">Full Time</option>
            <option value="PART_TIME">Part Time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERN">Intern</option>
          </Select>
        </div>
      </Card>

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={6} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title="No employees match these filters"
            description="Try clearing the search or choosing a different department."
            action={
              <Button
                onClick={() => {
                  setQ('');
                  setDepartmentId('');
                  setEmployeeType('');
                }}
              >
                Clear filters
              </Button>
            }
          />
        </Card>
      )}

      {/* ------------------------------------------------------ kanban view */}
      {data && data.length > 0 && view === 'kanban' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {data.map((employee) => (
            <button
              key={employee.id}
              onClick={() => navigate(`/employees/${employee.id}`)}
              className="group text-left"
            >
              <Card className="h-full p-4 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-pop">
                <div className="flex items-start gap-3">
                  <Avatar
                    firstName={employee.firstName}
                    lastName={employee.lastName}
                    avatarUrl={employee.avatarUrl}
                    gender={employee.gender}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-tight group-hover:text-brand">
                      {employee.firstName} {employee.lastName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {employee.jobPosition?.name ?? '—'}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-faint">{employee.code}</p>
                  </div>
                  {!employee.isActive && <Badge tone="neutral">Archived</Badge>}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {employee.department && (
                    <Badge tone="brand">{employee.department.name}</Badge>
                  )}
                  <Badge tone="neutral">{titleCase(employee.employeeType)}</Badge>
                </div>

                <p className="mt-3 truncate border-t border-line pt-3 text-xs text-muted">
                  {employee.workEmail}
                </p>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* -------------------------------------------------------- list view */}
      {data && data.length > 0 && view === 'list' && (
        <Card className="overflow-hidden">
          <TableWrap>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Code</Th>
                <Th>Department</Th>
                <Th>Job Position</Th>
                <Th>Manager</Th>
                <Th>Schedule</Th>
                <Th>Type</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((employee) => (
                <Tr key={employee.id} onClick={() => navigate(`/employees/${employee.id}`)}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        firstName={employee.firstName}
                        lastName={employee.lastName}
                        avatarUrl={employee.avatarUrl}
                        gender={employee.gender}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {employee.firstName} {employee.lastName}
                        </p>
                        <p className="truncate text-xs text-muted">{employee.workEmail}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-muted tabular">{employee.code}</Td>
                  <Td>{employee.department?.name ?? '—'}</Td>
                  <Td className="text-muted">{employee.jobPosition?.name ?? '—'}</Td>
                  <Td className="text-muted">
                    {employee.manager
                      ? `${employee.manager.firstName} ${employee.manager.lastName}`
                      : '—'}
                  </Td>
                  <Td className="text-muted">{employee.workingSchedule?.name ?? '—'}</Td>
                  <Td>
                    <Badge tone="neutral">{titleCase(employee.employeeType)}</Badge>
                  </Td>
                  <Td align="right">
                    <Badge tone={employee.isActive ? 'ok' : 'neutral'} dot>
                      {employee.isActive ? 'Active' : 'Archived'}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>

          <EmployeePager
            page={currentPage}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            total={data.length}
            onChange={setPage}
          />
        </Card>
      )}

      {creating && (
        <EmployeeEditor
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/employees/${saved.id}`)}
        />
      )}
    </>
  );
}
