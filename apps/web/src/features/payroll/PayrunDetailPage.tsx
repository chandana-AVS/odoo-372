import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calculator, CheckCircle2, Info, Mail, Wallet } from 'lucide-react';
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
  NoResults,
  PageHeader,
  ReadField,
  SearchInput,
  StateBadge,
  Td,
  Th,
  TableWrap,
  Tr,
} from '../../components/ui';
import { api } from '../../lib/api';
import { cn, money, shortDate } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { useSearch } from '../../lib/search';

const SEVERITY = {
  blocking: { tone: 'danger' as const, icon: AlertTriangle },
  warning: { tone: 'warn' as const, icon: AlertTriangle },
  info: { tone: 'info' as const, icon: Info },
};

/** One workflow action (Compute / Validate / Mark Paid / Send) on a payrun. */
function usePayrunAction(
  payrunId: string,
  path: string,
  onDone?: (result: any) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<any>(`/payruns/${payrunId}/${path}`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['payrun', payrunId] });
      queryClient.invalidateQueries({ queryKey: ['payruns'] });
      onDone?.(result);
    },
  });
}

export function PayrunDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['payrun', id],
    queryFn: () => api.get<any>(`/payruns/${id}`),
  });

  const compute = usePayrunAction(id, 'compute', () =>
    setNotice('Payslips recomputed from the salary rules.'),
  );
  const validate = usePayrunAction(id, 'validate', () => setNotice('Payrun validated.'));
  const markPaid = usePayrunAction(id, 'mark-paid', () => setNotice('Payrun marked as paid.'));
  const send = usePayrunAction(id, 'send-payslips', (result) =>
    setNotice(
      `Sent ${result.sent} payslip(s).` +
        (result.skipped?.length ? ` Skipped ${result.skipped.length}.` : ''),
    ),
  );

  // Declared before the early returns below so the hook order stays stable.
  const payslips = useSearch<any>(data?.payslips, q, (payslip) => [
    payslip.employee,
    payslip.number,
    payslip.state,
    payslip.workedDays,
    payslip.grossAmount,
    payslip.netAmount,
  ]);

  const pending =
    compute.isPending || validate.isPending || markPaid.isPending || send.isPending;
  const actionError =
    compute.error ?? validate.error ?? markPaid.error ?? send.error ?? null;

  if (isLoading) return <LoadingBlock rows={8} />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  const isPaid = data.state === 'PAID';

  // De-duplicate warnings for the banner — one line per issue type.
  const grouped = new Map<string, { severity: string; message: string; count: number }>();
  for (const warning of data.warnings ?? []) {
    const entry = grouped.get(warning.code) ?? {
      severity: warning.severity,
      message: warning.message,
      count: 0,
    };
    entry.count += 1;
    grouped.set(warning.code, entry);
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/payroll/payruns" className="hover:text-brand">
            Payruns
          </Link>
        }
        title={data.name}
        subtitle={`${shortDate(data.periodStart)} — ${shortDate(data.periodEnd)} · ${
          data.salaryStructure.name
        }`}
        action={
          <>
            <Button
              onClick={() => compute.mutate()}
              loading={compute.isPending}
              disabled={pending || isPaid}
            >
              <Calculator className="h-3.5 w-3.5" />
              Compute
            </Button>
            <Button
              onClick={() => validate.mutate()}
              loading={validate.isPending}
              disabled={pending || isPaid || data.state === 'DRAFT'}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Validate
            </Button>
            {can('HR_PAYROLL_MANAGER') && (
              <Button
                variant="primary"
                onClick={() => markPaid.mutate()}
                loading={markPaid.isPending}
                disabled={pending || data.state !== 'VALIDATED'}
              >
                <Wallet className="h-3.5 w-3.5" />
                Mark Paid
              </Button>
            )}
            <Button
              onClick={() => send.mutate()}
              loading={send.isPending}
              disabled={pending || data.state === 'DRAFT'}
            >
              <Mail className="h-3.5 w-3.5" />
              Send Payslips
            </Button>
          </>
        }
      />

      {actionError && <ErrorBlock error={actionError} />}

      {notice && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-ok/25 bg-ok/5 px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="ml-auto text-xs text-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <ReadField label="Status" value={<StateBadge state={data.state} />} />
        </Card>
        <Card className="p-4">
          <ReadField label="Payslips" value={data.totals.count} />
        </Card>
        <Card className="p-4">
          <ReadField label="Total Gross" value={money(data.totals.gross)} />
        </Card>
        <Card className="p-4">
          <ReadField
            label="Total Net"
            value={<span className="text-brand">{money(data.totals.net)}</span>}
          />
        </Card>
      </div>

      {/* Warnings — surfaced before finalization */}
      {grouped.size > 0 && (
        <Card className="mb-5 border-warn/30">
          <CardHeader
            title="Payroll warnings"
            subtitle="Blocking issues must be resolved before the payrun can be validated."
          />
          <ul className="divide-y divide-line">
            {[...grouped.entries()].map(([code, warning]) => {
              const meta = SEVERITY[warning.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
              return (
                <li key={code} className="flex items-start gap-3 px-5 py-3">
                  <meta.icon
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      warning.severity === 'blocking' ? 'text-danger' : 'text-warn',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{warning.message}</p>
                    <p className="mt-0.5 text-[11px] text-faint tabular">{code}</p>
                  </div>
                  <Badge tone={meta.tone}>
                    {warning.count} {warning.severity}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Payslips */}
      <Card>
        <CardHeader
          title="Payslips"
          subtitle={
            q
              ? `${payslips.length} of ${data.payslips.length} shown`
              : `${data.payslips.length} in this batch`
          }
          action={
            <SearchInput
              value={q}
              onChange={setQ}
              count={payslips.length}
              placeholder="Search employee…"
              className="w-full sm:w-60"
            />
          }
        />
        {data.payslips.length > 0 && payslips.length === 0 && (
          <NoResults query={q} onClear={() => setQ('')} noun="payslips" />
        )}
        {payslips.length > 0 && (
        <TableWrap>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>Payslip</Th>
              <Th align="right">Worked Days</Th>
              <Th align="right">Gross</Th>
              <Th align="right">Net</Th>
              <Th align="right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {payslips.map((payslip: any) => (
              <Tr key={payslip.id}>
                <Td>
                  <Link
                    to={`/payroll/payslips/${payslip.id}`}
                    className="flex items-center gap-2.5 hover:text-brand"
                  >
                    <Avatar
                      firstName={payslip.employee.firstName}
                      lastName={payslip.employee.lastName}
                      avatarUrl={payslip.employee.avatarUrl}
                      gender={payslip.employee.gender}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {payslip.employee.firstName} {payslip.employee.lastName}
                      </p>
                      <p className="truncate text-xs text-muted">{payslip.employee.code}</p>
                    </div>
                  </Link>
                </Td>
                <Td className="text-muted tabular">{payslip.number}</Td>
                <Td align="right" className="tabular">
                  {Number(payslip.workedDays)}
                </Td>
                <Td align="right" className="tabular">
                  {money(payslip.grossAmount)}
                </Td>
                <Td align="right" className="font-semibold tabular">
                  {money(payslip.netAmount)}
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1.5">
                    {(payslip.warnings ?? []).length > 0 && (
                      <span title={`${payslip.warnings.length} warning(s)`}>
                        <AlertTriangle className="h-3.5 w-3.5 text-warn" />
                      </span>
                    )}
                    <StateBadge state={payslip.state} />
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
        )}
      </Card>
    </>
  );
}
