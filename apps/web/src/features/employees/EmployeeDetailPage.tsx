import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, Pencil, Wallet } from 'lucide-react';
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  ReadField,
  StateBadge,
} from '../../components/ui';
import { api } from '../../lib/api';
import { HR_ROLES, useAuth } from '../../lib/auth';
import { money, shortDate, titleCase } from '../../lib/format';
import { EmployeeEditor } from './EmployeeEditor';

/** Smart button — count + deep link into the pre-filtered child list. */
function SmartButton({
  icon: Icon,
  label,
  count,
  to,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold leading-none tabular">{count}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{label}</span>
      </span>
    </Link>
  );
}

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canEdit = can(...HR_ROLES);
  const [editing, setEditing] = React.useState(false);

  const employee = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.get<any>(`/employees/${id}`),
  });

  const summary = useQuery({
    queryKey: ['employee', id, 'summary'],
    queryFn: () => api.get<any>(`/employees/${id}/summary`),
  });

  if (employee.isLoading) return <LoadingBlock rows={8} />;
  if (employee.error) return <ErrorBlock error={employee.error} />;
  if (!employee.data) return null;

  const e = employee.data;
  const s = summary.data;
  const contract = s?.activeContract;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/employees" className="hover:text-brand">
            Employees
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar
              firstName={e.firstName}
              lastName={e.lastName}
              avatarUrl={e.avatarUrl}
              gender={e.gender}
              size="lg"
            />
            <span className="min-w-0">
              <span className="block truncate">
                {e.firstName} {e.lastName}
              </span>
              <span className="block truncate text-sm font-normal text-muted">
                {e.jobPosition?.name ?? '—'} · {e.code}
              </span>
            </span>
          </span>
        }
        action={
          <>
            <Badge tone={e.isActive ? 'ok' : 'neutral'} dot>
              {e.isActive ? 'Active' : 'Archived'}
            </Badge>
            {canEdit && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </>
        }
      />

      {/* Smart buttons — counts open filtered child views */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SmartButton
          icon={Clock}
          label="Attendance"
          count={s?.attendance ?? 0}
          to={`/attendance?employeeId=${id}`}
        />
        <SmartButton
          icon={CalendarDays}
          label="Time Off"
          count={s?.timeOff ?? 0}
          to={`/time-off/requests?employeeId=${id}`}
        />
        <SmartButton
          icon={Wallet}
          label="Allocations"
          count={s?.allocations ?? 0}
          to={`/time-off/allocations?employeeId=${id}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Work information */}
        <Card className="lg:col-span-2">
          <CardHeader title="Work Information" />
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <ReadField label="Department" value={e.department?.name} />
            <ReadField label="Job Position" value={e.jobPosition?.name} />
            <ReadField
              label="Manager"
              value={e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : '—'}
            />
            <ReadField label="Working Schedule" value={e.workingSchedule?.name} />
            <ReadField label="Work Location" value={e.workLocation} />
            <ReadField label="Employee Type" value={titleCase(e.employeeType)} />
            <ReadField label="Work Email" value={e.workEmail} />
            <ReadField label="Phone" value={e.phone} />
            <ReadField label="Company" value={e.company?.name} />
          </div>

          <CardHeader title="Private Information" className="border-t" />
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <ReadField label="Personal Email" value={e.personalEmail} />
            <ReadField
              label="Bank Account"
              value={
                e.bankAccount ?? (
                  <span className="text-warn">Missing — blocks payment</span>
                )
              }
            />
            <ReadField label="Login" value={e.user?.email ?? 'No user account'} />
          </div>
        </Card>

        <div className="space-y-5">
          {/* Active contract */}
          <Card>
            <CardHeader
              title="Active Contract"
              subtitle="Used by payroll for the current period"
              action={
                contract && (
                  <Link
                    to={`/contracts/${contract.id}`}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    Open
                  </Link>
                )
              }
            />
            {contract ? (
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium tabular">{contract.reference}</span>
                  <StateBadge state={contract.status} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ReadField label="Wage / Month" value={money(contract.wage)} />
                  <ReadField label="Start Date" value={shortDate(contract.startDate)} />
                  <ReadField
                    label="Salary Structure"
                    value={contract.salaryStructure?.name}
                  />
                  <ReadField
                    label="Working Schedule"
                    value={contract.workingSchedule?.name}
                  />
                </div>
              </div>
            ) : (
              <p className="p-5 text-sm text-muted">
                No running contract — payroll cannot compute a payslip for this employee.
              </p>
            )}
          </Card>

          {/* Leave balances */}
          <Card>
            <CardHeader title="Leave Balances" subtitle="Allocated − taken" />
            <div className="p-5">
              {!s?.balances?.length ? (
                <p className="text-sm text-muted">No approved allocations.</p>
              ) : (
                <ul className="space-y-3.5">
                  {s.balances.map((balance: any) => (
                    <li key={balance.typeId}>
                      <div className="mb-1.5 flex items-baseline justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: balance.color }}
                          />
                          {balance.type}
                        </span>
                        <span className="tabular text-muted">
                          <strong className="text-ink">{balance.remaining}</strong> /{' '}
                          {balance.allocated}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            background: balance.color,
                            width: `${Math.min(
                              100,
                              (balance.taken / Math.max(1, balance.allocated)) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                      {balance.pending > 0 && (
                        <p className="mt-1 text-[11px] text-warn">
                          {balance.pending} day(s) pending approval
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>

      {editing && <EmployeeEditor employee={e} onClose={() => setEditing(false)} />}
    </>
  );
}
