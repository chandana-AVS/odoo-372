import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  HeartPulse,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Badge,
  Card,
  CardHeader,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  Select,
} from '../../components/ui';
import { api, qs } from '../../lib/api';
import { compactMoney, cn, money, monthInput } from '../../lib/format';

/** Categorical palette — one hue per series, legible on both themes. */
const SERIES = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

interface Dashboard {
  period: { label: string };
  kpis: {
    totalNetSalaryPaid: number;
    totalNetSalary: number;
    payslipsGenerated: number;
    avgSalaryPerEmployee: number;
    approvedTimeOffDays: number;
    attendanceHealth: number;
    headcount: number;
  };
  salaryByDepartment: {
    department: string;
    headcount: number;
    salary: number;
    contractedSalary: number;
  }[];
  monthlyTrend: { month: string; net: number; payslips: number }[];
  statusSplit: { draft: number; computed: number; validated: number; paid: number };
  alerts: { code: string; severity: string; count: number; message: string }[];
  attendanceOverview: Record<string, number>;
  timeOffOverview: {
    byType: { type: string; color: string; approvedDays: number; remaining: number }[];
    pendingRequests: number;
  };
  departmentOverview: { department: string; headcount: number; monthlySalary: number }[];
}

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="tabular text-muted">
          {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [period, setPeriod] = React.useState(monthInput());
  const [departmentId, setDepartmentId] = React.useState('');
  const [employeeType, setEmployeeType] = React.useState('');

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/departments'),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', period, departmentId, employeeType],
    queryFn: () =>
      api.get<Dashboard>(`/dashboard${qs({ period, departmentId, employeeType })}`),
  });

  const kpis = data?.kpis;

  const cards = [
    {
      label: 'Total Net Salary Paid',
      value: money(kpis?.totalNetSalaryPaid ?? 0),
      icon: Wallet,
      hint: `${money(kpis?.totalNetSalary ?? 0)} computed`,
    },
    {
      label: 'Payslips Generated',
      value: String(kpis?.payslipsGenerated ?? 0),
      icon: FileText,
      hint: `${kpis?.headcount ?? 0} active employees`,
    },
    {
      label: 'Avg Salary / Employee',
      value: money(kpis?.avgSalaryPerEmployee ?? 0),
      icon: TrendingUp,
      hint: 'Net, this period',
    },
    {
      label: 'Approved Time Off',
      value: `${kpis?.approvedTimeOffDays ?? 0} days`,
      icon: CalendarDays,
      hint: `${data?.timeOffOverview.pendingRequests ?? 0} pending`,
    },
    {
      label: 'Attendance Health',
      value: `${kpis?.attendanceHealth ?? 0}%`,
      icon: HeartPulse,
      hint: `${data?.attendanceOverview.totalHours ?? 0}h logged`,
    },
  ];

  return (
    <>
      <PageHeader
        title="Payroll Dashboard"
        subtitle={
          data ? `Live figures for ${data.period.label}` : 'Aggregated across HR and payroll'
        }
      />

      {/* Filters — every one of these re-queries the server */}
      <Card className="mb-5 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-faint">
              Period
            </span>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-faint">
              Department
            </span>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All Departments</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-faint">
              Employee Type
            </span>
            <Select value={employeeType} onChange={(e) => setEmployeeType(e.target.value)}>
              <option value="">All Types</option>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERN">Intern</option>
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-faint">
              Company
            </span>
            <Select disabled>
              <option>OXP Pvt Ltd</option>
            </Select>
          </label>
        </div>
      </Card>

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={8} />}

      {data && (
        <div className="space-y-5">
          {/* ------------------------------------------------------ KPI cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {cards.map((card) => (
              <Card key={card.label} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
                    {card.label}
                  </span>
                  <card.icon className="h-4 w-4 shrink-0 text-brand" />
                </div>
                <p className="mt-2 truncate text-xl font-semibold tabular tracking-tight">
                  {card.value}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted">{card.hint}</p>
              </Card>
            ))}
          </div>

          {/* -------------------------------------------------------- charts */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Salary Cost by Department"
                subtitle="Net salary paid this period"
              />
              <div className="h-64 p-4">
                {data.salaryByDepartment.length === 0 ? (
                  <p className="grid h-full place-items-center text-sm text-muted">
                    No payslips in this period.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.salaryByDepartment} margin={{ left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                      <XAxis
                        dataKey="department"
                        tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={compactMoney}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgb(var(--elevated))' }}
                        content={<ChartTooltip formatter={money} />}
                      />
                      <Bar dataKey="salary" radius={[6, 6, 0, 0]} maxBarSize={52}>
                        {data.salaryByDepartment.map((_, i) => (
                          <Cell key={i} fill={SERIES[i % SERIES.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* --------------------------------------- status split + alerts */}
            <Card>
              <CardHeader title="Payslip Status & Alerts" />
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Paid', data.statusSplit.paid, 'text-ok'],
                    ['Validated', data.statusSplit.validated, 'text-brand'],
                    ['Computed', data.statusSplit.computed, 'text-info'],
                    ['Draft', data.statusSplit.draft, 'text-muted'],
                  ].map(([label, value, tone]) => (
                    <div key={label as string} className="rounded-lg bg-elevated px-3 py-2">
                      <p className={cn('text-lg font-semibold tabular', tone as string)}>
                        {value as number}
                      </p>
                      <p className="text-[11px] text-muted">{label as string}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
                    Current alerts
                  </p>
                  {data.alerts.length === 0 ? (
                    <p className="text-xs text-muted">Nothing needs attention.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {data.alerts.map((alert) => (
                        <li key={alert.code} className="flex items-start gap-2 text-xs">
                          <AlertTriangle
                            className={cn(
                              'mt-0.5 h-3.5 w-3.5 shrink-0',
                              alert.severity === 'blocking' ? 'text-danger' : 'text-warn',
                            )}
                          />
                          <span>
                            <strong className="tabular">{alert.count}</strong> {alert.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* --------------------------------------------------- trend chart */}
          <Card>
            <CardHeader
              title="Monthly Net Salary Trend"
              subtitle="Six months of actual payslip totals"
            />
            <div className="h-56 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.monthlyTrend} margin={{ left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={compactMoney}
                  />
                  <Tooltip content={<ChartTooltip formatter={money} />} />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke={SERIES[0]}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: SERIES[0] }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* ------------------------------------------------ three overviews */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Attendance Overview" subtitle="Source: Attendance" />
              <div className="grid grid-cols-2 gap-px overflow-hidden bg-line">
                {[
                  ['Present', data.attendanceOverview.present],
                  ['Late', data.attendanceOverview.late],
                  ['Overtime', data.attendanceOverview.overtime],
                  ['Absent', data.attendanceOverview.absent],
                  ['Missing check-outs', data.attendanceOverview.missingCheckouts],
                  ['Manual edits', data.attendanceOverview.manualEdits],
                ].map(([label, value]) => (
                  <div key={label as string} className="bg-surface px-4 py-3">
                    <p className="text-lg font-semibold tabular">{value as number}</p>
                    <p className="text-[11px] text-muted">{label as string}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-line px-4 py-3">
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted">Coverage</span>
                  <span className="font-medium tabular">
                    {data.attendanceOverview.coverage}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-ok transition-all"
                    style={{ width: `${data.attendanceOverview.coverage}%` }}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Time Off Overview"
                subtitle="Source: Requests + Allocations"
              />
              <div className="p-4">
                {data.timeOffOverview.byType.length === 0 ? (
                  <p className="text-xs text-muted">No leave data for this period.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.timeOffOverview.byType.map((entry) => (
                      <li key={entry.type}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: entry.color }}
                            />
                            {entry.type}
                          </span>
                          <span className="tabular text-muted">
                            {entry.approvedDays} taken · {entry.remaining} left
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              background: entry.color,
                              width: `${Math.min(
                                100,
                                (entry.approvedDays /
                                  Math.max(1, entry.approvedDays + entry.remaining)) *
                                  100,
                              )}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="text-muted">Pending requests</span>
                  <Badge tone={data.timeOffOverview.pendingRequests ? 'warn' : 'neutral'}>
                    {data.timeOffOverview.pendingRequests}
                  </Badge>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Department Overview"
                subtitle="Source: Employee + Contract + Payslip"
              />
              <div className="scroll-x">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-faint">
                      <th className="px-4 py-2 text-left font-semibold">Department</th>
                      <th className="px-4 py-2 text-right font-semibold">Head</th>
                      <th className="px-4 py-2 text-right font-semibold">Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.departmentOverview.map((row) => (
                      <tr key={row.department} className="border-t border-line/60">
                        <td className="truncate px-4 py-2">{row.department}</td>
                        <td className="px-4 py-2 text-right tabular">{row.headcount}</td>
                        <td className="px-4 py-2 text-right tabular font-medium">
                          {compactMoney(row.monthlySalary)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
