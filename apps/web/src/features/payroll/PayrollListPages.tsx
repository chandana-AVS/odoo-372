import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Mail, Plus, Receipt } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  NoResults,
  PageHeader,
  SearchInput,
  Select,
  StateBadge,
  Td,
  Th,
  TableWrap,
  Tr,
} from '../../components/ui';
import { api, qs } from '../../lib/api';
import { money, shortDate } from '../../lib/format';
import { useSearch } from '../../lib/search';
import { PAYROLL_ROLES, useAuth } from '../../lib/auth';

/* -------------------------------------------------------------------------- */
/* Payruns                                                                     */
/* -------------------------------------------------------------------------- */

export function PayrunsPage() {
  const navigate = useNavigate();
  const [state, setState] = React.useState('');
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['payruns', state],
    queryFn: () => api.get<any[]>(`/payruns${qs({ state })}`),
  });

  const rows = useSearch(data, q, (payrun) => [
    payrun.name,
    payrun.state,
    payrun.salaryStructure?.name,
    payrun.department?.name,
    shortDate(payrun.periodStart),
    shortDate(payrun.periodEnd),
  ]);

  return (
    <>
      <PageHeader
        title="Payruns"
        subtitle="Each payrun groups the payslips for one payroll period."
        action={
          <>
            <SearchInput
              value={q}
              onChange={setQ}
              count={rows.length}
              placeholder="Search payruns…"
              className="w-full sm:w-64"
            />
            <Select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-36"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="COMPUTED">Computed</option>
              <option value="VALIDATED">Validated</option>
              <option value="PAID">Paid</option>
            </Select>
            <Button variant="primary" onClick={() => navigate('/payroll/payruns/new')}>
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </>
        }
      />

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={5} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={Receipt}
            title="No payruns yet"
            description="Start a payrun to generate payslips for a period."
            action={
              <Button variant="primary" onClick={() => navigate('/payroll/payruns/new')}>
                <Plus className="h-3.5 w-3.5" />
                New Pay Run
              </Button>
            }
          />
        </Card>
      )}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="payruns" />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Payrun</Th>
                <Th>Period</Th>
                <Th>Salary Structure</Th>
                <Th>Scope</Th>
                <Th align="right">Payslips</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payrun) => (
                <Tr
                  key={payrun.id}
                  onClick={() => navigate(`/payroll/payruns/${payrun.id}`)}
                >
                  <Td className="font-medium">{payrun.name}</Td>
                  <Td className="text-muted tabular">
                    {shortDate(payrun.periodStart)} — {shortDate(payrun.periodEnd)}
                  </Td>
                  <Td className="text-muted">{payrun.salaryStructure?.name}</Td>
                  <Td className="text-muted">
                    {payrun.department?.name ?? 'All departments'}
                  </Td>
                  <Td align="right" className="tabular">
                    {payrun._count.payslips}
                  </Td>
                  <Td align="right">
                    <StateBadge state={payrun.state} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Payslips                                                                    */
/* -------------------------------------------------------------------------- */

export function PayslipsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const employeeId = params.get('employeeId') ?? '';
  const [state, setState] = React.useState('');
  const [q, setQ] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [notice, setNotice] = React.useState<string | null>(null);
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canSend = can(...PAYROLL_ROLES);

  const send = useMutation({
    mutationFn: () =>
      api.post<{ sent: number; skipped: { employee: string; reason: string }[] }>(
        '/payslips/send',
        { ids: [...selected] },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      setSelected(new Set());
      setNotice(
        `Sent ${result.sent} payslip(s).` +
          (result.skipped.length
            ? ` Skipped ${result.skipped.length}: ${result.skipped
                .map((s) => `${s.employee} (${s.reason})`)
                .join(', ')}`
            : ''),
      );
    },
  });

  const [page, setPage] = React.useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['payslips', employeeId, state, page],
    queryFn: () =>
      api.get<{
        rows: any[];
        total: number;
        page: number;
        pageSize: number;
        pageCount: number;
      }>(`/payslips${qs({ employeeId, state, page })}`),
    placeholderData: (previous) => previous,
  });

  const payslipRows = data?.rows ?? [];
  const rows = useSearch(payslipRows, q, (payslip) => [
    payslip.employee,
    payslip.number,
    payslip.state,
    payslip.payrun?.name,
    shortDate(payslip.periodStart),
    payslip.grossAmount,
    payslip.netAmount,
  ]);

  // A filter change hides rows, so a stale selection would send invisible ones.
  React.useEffect(() => setSelected(new Set()), [employeeId, state, q, page]);
  React.useEffect(() => setPage(1), [employeeId, state, q]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someChecked = rows.some((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  return (
    <>
      <PageHeader
        title="Payslips"
        subtitle="Every computed payslip, across all payruns."
        action={
          <>
            <SearchInput
              value={q}
              onChange={setQ}
              count={rows.length}
              placeholder="Search employee or payslip no…"
              className="w-full sm:w-72"
            />
            <Select value={state} onChange={(e) => setState(e.target.value)} className="w-36">
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="COMPUTED">Computed</option>
              <option value="VALIDATED">Validated</option>
              <option value="PAID">Paid</option>
            </Select>
            {canSend && selected.size > 0 && (
              <Button
                variant="primary"
                loading={send.isPending}
                onClick={() => send.mutate()}
              >
                <Mail className="h-3.5 w-3.5" />
                Email {selected.size} payslip{selected.size === 1 ? '' : 's'}
              </Button>
            )}
          </>
        }
      />

      {notice && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-ok/25 bg-ok/5 px-4 py-3 text-sm">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 text-xs text-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {send.isError && (
        <div className="mb-5 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          {(send.error as Error).message}
        </div>
      )}

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={6} />}

      {data && payslipRows.length === 0 && (
        <Card>
          <EmptyState
            icon={FileText}
            title="No payslips found"
            description="Compute a payrun to generate payslips."
          />
        </Card>
      )}

      {data && payslipRows.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="payslips" />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                {canSend && (
                  <Th className="w-10">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={!allChecked && someChecked}
                      onChange={toggleAll}
                    />
                  </Th>
                )}
                <Th>Employee</Th>
                <Th>Payslip</Th>
                <Th>Pay Run</Th>
                <Th>Period</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Net</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payslip) => (
                <Tr
                  key={payslip.id}
                  onClick={() => navigate(`/payroll/payslips/${payslip.id}`)}
                >
                  {canSend && (
                    <Td>
                      {/* Stop the row's navigate firing when ticking a box. */}
                      <span onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(payslip.id)}
                          onChange={() => toggle(payslip.id)}
                        />
                      </span>
                    </Td>
                  )}
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        firstName={payslip.employee.firstName}
                        lastName={payslip.employee.lastName}
                        avatarUrl={payslip.employee.avatarUrl}
                        gender={payslip.employee.gender}
                        size="sm"
                      />
                      <span className="truncate font-medium">
                        {payslip.employee.firstName} {payslip.employee.lastName}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-muted tabular">{payslip.number}</Td>
                  <Td className="text-muted">{payslip.payrun?.name ?? '—'}</Td>
                  <Td className="text-muted tabular">{shortDate(payslip.periodStart)}</Td>
                  <Td align="right" className="tabular">
                    {money(payslip.grossAmount)}
                  </Td>
                  <Td align="right" className="font-semibold tabular">
                    {money(payslip.netAmount)}
                  </Td>
                  <Td align="right">
                    <StateBadge state={payslip.state} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>

          {/* Pager — 50 rows a page, so a full payrun stays readable. */}
          {data && data.pageCount > 1 && (
            <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                Showing{' '}
                <span className="font-medium text-ink tabular">
                  {(data.page - 1) * data.pageSize + 1}–
                  {Math.min(data.page * data.pageSize, data.total)}
                </span>{' '}
                of <span className="font-medium text-ink tabular">{data.total}</span> payslips
                {q && ' (search filters this page)'}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                >
                  Previous
                </Button>
                <span className="tabular text-xs text-muted">
                  Page {data.page} of {data.pageCount}
                </span>
                <Button
                  size="sm"
                  disabled={data.page >= data.pageCount}
                  onClick={() => setPage((p) => Math.min(p + 1, data.pageCount))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Salary rules (flat list across structures)                                  */
/* -------------------------------------------------------------------------- */

export function SalaryRulesPage() {
  const [structureId, setStructureId] = React.useState('');
  const [q, setQ] = React.useState('');

  const structures = useQuery({
    queryKey: ['salary-structures'],
    queryFn: () => api.get<any[]>('/salary-structures'),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['salary-rules', structureId],
    queryFn: () => api.get<any[]>(`/salary-rules${qs({ structureId })}`),
  });

  const rows = useSearch(data, q, (rule) => [
    rule.name,
    rule.code,
    rule.category,
    rule.computationType,
    rule.structure?.name,
    rule.sequence,
  ]);

  return (
    <>
      <PageHeader
        title="Salary Rules"
        subtitle="Rules are processed in sequence order — later rules build on earlier results."
        action={
          <>
            <SearchInput
              value={q}
              onChange={setQ}
              count={rows.length}
              placeholder="Search rule name or code…"
              className="w-full sm:w-64"
            />
            <Select
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
              className="w-52"
            >
              <option value="">All structures</option>
              {structures.data?.map((structure) => (
                <option key={structure.id} value={structure.id}>
                  {structure.name}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={7} />}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="salary rules" />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th align="right" className="w-16">
                  Seq
                </Th>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Category</Th>
                <Th>Structure</Th>
                <Th>Computation</Th>
                <Th align="right">Value</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rule) => (
                <Tr key={rule.id}>
                  <Td align="right" className="tabular text-faint">
                    {rule.sequence}
                  </Td>
                  <Td>
                    <Link
                      to={`/payroll/structures/${rule.structure.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {rule.name}
                    </Link>
                  </Td>
                  <Td className="tabular text-muted">{rule.code}</Td>
                  <Td>
                    <Badge
                      tone={
                        rule.category === 'DEDUCTION'
                          ? 'danger'
                          : rule.category === 'NET'
                            ? 'brand'
                            : 'neutral'
                      }
                    >
                      {rule.category.charAt(0) + rule.category.slice(1).toLowerCase()}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{rule.structure.name}</Td>
                  <Td className="text-muted">
                    {rule.computationType === 'FIXED'
                      ? 'Fixed Amount'
                      : rule.computationType === 'PERCENTAGE'
                        ? 'Percentage'
                        : 'Formula'}
                  </Td>
                  <Td align="right" className="tabular">
                    {rule.computationType === 'FIXED'
                      ? money(rule.amountFixed)
                      : rule.computationType === 'PERCENTAGE'
                        ? `${Number(rule.percentage)}%`
                        : '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
