import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  SearchInput,
  Select,
  Td,
  Th,
  TableWrap,
  Tr,
} from '../../components/ui';
import { api } from '../../lib/api';
import { cn, money, monthInput, monthRange, shortDate, titleCase } from '../../lib/format';
import { useSearch } from '../../lib/search';
import { PreflightPanel, hasBlockingIssues } from './PreflightPanel';

interface Eligible {
  employeeId: string;
  code: string;
  name: string;
  department: string | null;
  employeeType: string;
  contractReference: string;
  startDate: string;
  wage: number;
  workingSchedule: string | null;
  payStructure: string | null;
  hasBankAccount: boolean;
  hasWorkEmail: boolean;
  hasSalaryStructure: boolean;
  duplicatePayslip: string | null;
  duplicateOf: string | null;
}

/**
 * Two-step payrun creation.
 *
 * Step 1 captures scope. "Continue" ONLY advances the wizard — it creates
 * nothing. The Payrun is persisted exclusively by "Create Payrun" in step 2,
 * and contains only the employees ticked there.
 */
export function PayrunWizard() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<1 | 2>(1);

  const [period, setPeriod] = React.useState(monthInput());
  const [salaryStructureId, setStructure] = React.useState('');
  const [employeeType, setEmployeeType] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [name, setName] = React.useState('');

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState('');

  const range = monthRange(period);

  const structures = useQuery({
    queryKey: ['salary-structures'],
    queryFn: () => api.get<any[]>('/salary-structures'),
  });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/departments'),
  });

  React.useEffect(() => {
    if (!salaryStructureId && structures.data?.length) {
      setStructure(structures.data[0].id);
    }
  }, [structures.data, salaryStructureId]);

  const scope = {
    salaryStructureId,
    periodStart: range.start,
    periodEnd: range.end,
    employeeType: employeeType || undefined,
    departmentId: departmentId || undefined,
  };

  // Step 2 data — a READ. Nothing is persisted by loading this.
  const eligible = useQuery({
    queryKey: ['eligible', scope],
    queryFn: () => api.post<Eligible[]>('/payruns/eligible-employees', scope),
    enabled: step === 2 && Boolean(salaryStructureId),
  });

  React.useEffect(() => {
    if (eligible.data) {
      setSelected(new Set(eligible.data.map((row) => row.employeeId)));
    }
  }, [eligible.data]);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/payruns', {
        ...scope,
        name: name || range.label,
        employeeIds: [...selected],
      }),
    onSuccess: (payrun) => navigate(`/payroll/payruns/${payrun.id}`),
  });

  const rows = useSearch(eligible.data, search, (row) => [
    row.name,
    row.code,
    row.department,
    row.employeeType,
    row.contractReference,
    row.workingSchedule,
    row.payStructure,
    row.wage,
  ]);

  /** Only the ticked employees matter for pre-flight — the rest are excluded. */
  const chosen = React.useMemo(
    () => (eligible.data ?? []).filter((row) => selected.has(row.employeeId)),
    [eligible.data, selected],
  );
  const blocked = React.useMemo(() => hasBlockingIssues(chosen), [chosen]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.employeeId));
  const someChecked = rows.some((r) => selected.has(r.employeeId));

  const toggle = (employeeId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(employeeId) ? next.delete(employeeId) : next.add(employeeId);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) rows.forEach((r) => next.delete(r.employeeId));
      else rows.forEach((r) => next.add(r.employeeId));
      return next;
    });

  const totalWage = rows
    .filter((r) => selected.has(r.employeeId))
    .reduce((sum, r) => sum + r.wage, 0);

  return (
    <>
      <PageHeader
        breadcrumb="Payroll / Payruns"
        title="New Pay Run"
        subtitle={
          step === 1
            ? 'Step 1 of 2 — define the payroll scope'
            : 'Step 2 of 2 — choose exactly who is included'
        }
      />

      {/* Stepper */}
      <div className="mb-5 flex items-center gap-3">
        {(
          [
            [1, 'Scope & Period'],
            [2, 'Select Employees'],
          ] as const
        ).map(([index, label], i) => (
          <React.Fragment key={index}>
            {i > 0 && (
              <span
                className={cn(
                  'h-px flex-1 transition-colors',
                  step > 1 ? 'bg-brand' : 'bg-line',
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  step >= index
                    ? 'bg-brand text-white dark:text-zinc-950'
                    : 'bg-elevated text-muted',
                )}
              >
                {index}
              </span>
              <span
                className={cn(
                  'hidden text-sm font-medium sm:block',
                  step >= index ? 'text-ink' : 'text-muted',
                )}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* ------------------------------------------------------------ step 1 */}
      {step === 1 && (
        <Card className="max-w-2xl">
          <div className="space-y-5 p-5">
            <Field label="Salary Structure" required hint="Dictates which rules compute the payslips.">
              <Select
                value={salaryStructureId}
                onChange={(e) => setStructure(e.target.value)}
              >
                {structures.data?.map((structure) => (
                  <option key={structure.id} value={structure.id}>
                    {structure.name} ({structure.ruleCount} rules)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Period" required hint={`${range.start} → ${range.end}`}>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Employee Type" hint="Leave blank for everyone.">
                <Select
                  value={employeeType}
                  onChange={(e) => setEmployeeType(e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Intern</option>
                </Select>
              </Field>

              <Field label="Department" hint="Leave blank for the whole company.">
                <Select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {departments.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Payrun Name" hint={`Defaults to "${range.label}".`}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={range.label}
              />
            </Field>
          </div>

          <div className="flex justify-between gap-2 border-t border-line px-5 py-3.5">
            <Button onClick={() => navigate('/payroll/payruns')}>Discard</Button>
            <Button
              variant="primary"
              disabled={!salaryStructureId}
              onClick={() => setStep(2)}
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------ step 2 */}
      {step === 2 && (
        <Card>
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Select Employee Records</h2>
              <p className="mt-0.5 text-xs text-muted">
                {range.label} · {selected.size} of {eligible.data?.length ?? 0} selected ·{' '}
                {money(totalWage)} contracted wage
              </p>
            </div>
            <SearchInput
              value={search}
              onChange={setSearch}
              count={rows.length}
              placeholder="Search employees…"
              className="w-full sm:w-64"
            />
          </div>

          {eligible.isLoading && <LoadingBlock rows={6} />}
          {eligible.error && <ErrorBlock error={eligible.error} />}

          {/* Pre-flight: problems in the TICKED employees, before computing. */}
          {eligible.data && eligible.data.length > 0 && (
            <div className="px-5 pt-4">
              <PreflightPanel rows={chosen} />
            </div>
          )}

          {eligible.data && rows.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-muted">
              No employee has a running contract covering {range.label}.
            </p>
          )}

          {rows.length > 0 && (
            <TableWrap>
              <thead>
                <tr>
                  <Th className="w-10">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={!allChecked && someChecked}
                      onChange={toggleAll}
                    />
                  </Th>
                  <Th>Employee</Th>
                  <Th>Working Hours</Th>
                  <Th>Start Date</Th>
                  <Th align="right">Wage</Th>
                  <Th>Pay Structure</Th>
                  <Th align="right">Flags</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const checked = selected.has(row.employeeId);
                  return (
                    <Tr
                      key={row.employeeId}
                      active={checked}
                      onClick={() => toggle(row.employeeId)}
                    >
                      <Td>
                        <Checkbox checked={checked} onChange={() => toggle(row.employeeId)} />
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            firstName={row.name.split(' ')[0]}
                            lastName={row.name.split(' ')[1]}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.name}</p>
                            <p className="truncate text-xs text-muted">
                              {row.department ?? '—'} · {titleCase(row.employeeType)}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-muted">{row.workingSchedule ?? '—'}</Td>
                      <Td className="text-muted tabular">{shortDate(row.startDate)}</Td>
                      <Td align="right" className="font-medium tabular">
                        {money(row.wage)}
                      </Td>
                      <Td className="text-muted">{row.payStructure ?? '—'}</Td>
                      <Td align="right">
                        <div className="flex justify-end gap-1">
                          {!row.hasBankAccount && (
                            <Badge tone="warn">No bank account</Badge>
                          )}
                          {row.duplicatePayslip && (
                            <Badge tone="danger">Duplicate</Badge>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}

          {create.isError && <ErrorBlock error={create.error} />}

          <div className="flex flex-col gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <AlertTriangle className="h-3.5 w-3.5 text-warn" />
              The payrun is created only now — and only for the ticked employees.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setStep(1)}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>
              <Button
                variant="primary"
                disabled={selected.size === 0 || blocked}
                loading={create.isPending}
                onClick={() => create.mutate()}
                title={
                  blocked
                    ? 'Resolve the blocking issues above, or untick those employees.'
                    : undefined
                }
              >
                Create Payrun ({selected.size})
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
