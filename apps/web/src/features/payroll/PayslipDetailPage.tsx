import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Printer } from 'lucide-react';
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorBlock,
  LoadingBlock,
  NoResults,
  PageHeader,
  ReadField,
  SearchInput,
  StateBadge,
} from '../../components/ui';
import { api, getToken } from '../../lib/api';
import { cn, money, shortDate } from '../../lib/format';
import { useSearch } from '../../lib/search';

const CATEGORY_TONE: Record<string, string> = {
  BASIC: 'text-ink',
  ALLOWANCE: 'text-ink',
  GROSS: 'text-ink font-semibold',
  DEDUCTION: 'text-danger',
  NET: 'text-brand font-semibold',
};

export function PayslipDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['payslip', id],
    queryFn: () => api.get<any>(`/payslips/${id}`),
  });

  // Declared before the early returns below so the hook order stays stable.
  const lines = useSearch<any>(data?.lines, q, (line) => [
    line.name,
    line.code,
    line.category,
    line.amount,
    line.sequence,
  ]);

  const compute = useMutation({
    mutationFn: () => api.post(`/payslips/${id}/compute`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payslip', id] }),
  });

  /** The PDF route needs the bearer token, so fetch as a blob and open it. */
  async function printPayslip() {
    const response = await fetch(`/api/payslips/${id}/pdf`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  if (isLoading) return <LoadingBlock rows={8} />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  const warnings = data.warnings ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={
          data.payrun ? (
            <Link to={`/payroll/payruns/${data.payrun.id}`} className="hover:text-brand">
              {data.payrun.name}
            </Link>
          ) : (
            <Link to="/payroll/payslips" className="hover:text-brand">
              Payslips
            </Link>
          )
        }
        title={`${data.employee.firstName} ${data.employee.lastName}`}
        subtitle={`${data.number} · ${shortDate(data.periodStart)} — ${shortDate(
          data.periodEnd,
        )}`}
        action={
          <>
            <Button onClick={() => compute.mutate()} loading={compute.isPending}>
              <Calculator className="h-3.5 w-3.5" />
              Compute
            </Button>
            <Button variant="primary" onClick={printPayslip}>
              <Printer className="h-3.5 w-3.5" />
              Print Payslip
            </Button>
          </>
        }
      />

      {warnings.length > 0 && (
        <Card className="mb-5 border-warn/30 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-warn">
            {warnings.length} warning(s) on this payslip
          </p>
          <ul className="space-y-1">
            {warnings.map((warning: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Badge tone={warning.severity === 'blocking' ? 'danger' : 'warn'}>
                  {warning.severity}
                </Badge>
                <span className="text-muted">{warning.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Identification */}
        <Card className="lg:col-span-1">
          <CardHeader title="Payslip Details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1">
            <ReadField
              label="Employee"
              value={`${data.employee.firstName} ${data.employee.lastName}`}
            />
            <ReadField label="Department" value={data.employee.department?.name} />
            <ReadField label="Salary Structure" value={data.salaryStructure.name} />
            <ReadField label="Pay Run" value={data.payrun?.name} />
            <ReadField
              label="Period"
              value={`${shortDate(data.periodStart)} — ${shortDate(data.periodEnd)}`}
            />
            <ReadField label="Worked Days" value={Number(data.workedDays)} />
            <ReadField label="Contract" value={data.contract?.reference} />
            <ReadField label="Status" value={<StateBadge state={data.state} />} />
          </div>
        </Card>

        {/* Salary computation */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Salary Computation"
            subtitle="Every line is produced by a salary rule, in sequence order"
            action={
              data.lines.length > 0 && (
                <SearchInput
                  value={q}
                  onChange={setQ}
                  count={lines.length}
                  placeholder="Search lines…"
                  className="w-full sm:w-52"
                />
              )
            }
          />

          {data.lines.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted">
              Not computed yet — run Compute to generate the breakdown.
            </p>
          ) : lines.length === 0 ? (
            <NoResults query={q} onClear={() => setQ('')} noun="lines" />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-faint">
                    <th className="border-b border-line px-5 py-2.5 text-left font-semibold">
                      Rule
                    </th>
                    <th className="border-b border-line px-4 py-2.5 text-left font-semibold">
                      Code
                    </th>
                    <th className="border-b border-line px-4 py-2.5 text-left font-semibold">
                      Category
                    </th>
                    <th className="border-b border-line px-5 py-2.5 text-right font-semibold">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line: any) => (
                    <tr
                      key={line.id}
                      className={cn(
                        'border-b border-line/60',
                        (line.category === 'GROSS' || line.category === 'NET') &&
                          'bg-elevated/60',
                      )}
                    >
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="w-6 text-[11px] tabular text-faint">
                            {line.sequence}
                          </span>
                          {line.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs tabular text-muted">{line.code}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          tone={
                            line.category === 'DEDUCTION'
                              ? 'danger'
                              : line.category === 'NET'
                                ? 'brand'
                                : 'neutral'
                          }
                        >
                          {line.category.charAt(0) + line.category.slice(1).toLowerCase()}
                        </Badge>
                      </td>
                      <td
                        className={cn(
                          'px-5 py-2.5 text-right tabular',
                          CATEGORY_TONE[line.category],
                        )}
                      >
                        {money(line.amount, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Net banner */}
          <div className="m-5 flex items-center justify-between rounded-xl bg-brand px-5 py-4 text-white dark:text-zinc-950">
            <span className="text-xs font-medium uppercase tracking-wider opacity-85">
              Net Salary
            </span>
            <span className="text-2xl font-semibold tabular">
              {money(data.netAmount, true)}
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}
