import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Receipt } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['payslips', employeeId, state],
    queryFn: () => api.get<any[]>(`/payslips${qs({ employeeId, state })}`),
  });

  const rows = useSearch(data, q, (payslip) => [
    payslip.employee,
    payslip.number,
    payslip.state,
    payslip.payrun?.name,
    shortDate(payslip.periodStart),
    payslip.grossAmount,
    payslip.netAmount,
  ]);

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
          </>
        }
      />

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={6} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={FileText}
            title="No payslips found"
            description="Compute a payrun to generate payslips."
          />
        </Card>
      )}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="payslips" />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
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
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        firstName={payslip.employee.firstName}
                        lastName={payslip.employee.lastName}
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
