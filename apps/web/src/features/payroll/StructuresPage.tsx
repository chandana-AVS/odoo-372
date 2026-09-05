import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  NoResults,
  PageHeader,
  ReadField,
  SearchInput,
  Select,
  Td,
  Th,
  TableWrap,
  Textarea,
  Tr,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { money } from '../../lib/format';
import { useSearch } from '../../lib/search';

const CATEGORIES = ['BASIC', 'ALLOWANCE', 'GROSS', 'DEDUCTION', 'NET'] as const;
const BASES = [
  ['CONTRACT_WAGE', 'Contract Wage'],
  ['BASIC', 'Basic Salary'],
  ['GROSS', 'Gross Salary'],
  ['CATEGORY_ALLOWANCE', 'Total Allowances'],
  ['CATEGORY_DEDUCTION', 'Total Deductions'],
] as const;

/* -------------------------------------------------------------------------- */
/* List                                                                        */
/* -------------------------------------------------------------------------- */

export function StructuresPage() {
  const navigate = useNavigate();
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['salary-structures'],
    queryFn: () => api.get<any[]>('/salary-structures'),
  });

  const rows = useSearch(data, q, (structure) => [
    structure.name,
    structure.code,
    structure.isActive ? 'active' : 'inactive',
  ]);

  return (
    <>
      <PageHeader
        title="Salary Structures"
        subtitle="A structure is an ordered collection of salary rules. The payrun picks one."
        action={
          <SearchInput
            value={q}
            onChange={setQ}
            count={rows.length}
            placeholder="Search structures…"
            className="w-full sm:w-64"
          />
        }
      />

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={4} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState icon={Layers} title="No salary structures configured" />
        </Card>
      )}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="structures" />
        </Card>
      )}

      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((structure) => (
            <button
              key={structure.id}
              onClick={() => navigate(`/payroll/structures/${structure.id}`)}
              className="text-left"
            >
              <Card className="h-full p-5 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-pop">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{structure.name}</p>
                    <p className="mt-0.5 truncate text-xs tabular text-muted">
                      {structure.code}
                    </p>
                  </div>
                  <Badge tone={structure.isActive ? 'ok' : 'neutral'} dot>
                    {structure.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
                  <ReadField label="Rules" value={structure.ruleCount} />
                  <ReadField label="Contracts" value={structure.employeeCount} />
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail — rules in sequence, editable inline                                 */
/* -------------------------------------------------------------------------- */

export function StructureDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can('HR_PAYROLL_MANAGER');
  const [editing, setEditing] = React.useState<any | null>(null);
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['salary-structure', id],
    queryFn: () => api.get<any>(`/salary-structures/${id}`),
  });

  const remove = useMutation({
    mutationFn: (ruleId: string) => api.delete(`/salary-rules/${ruleId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salary-structure', id] }),
  });

  // Declared before the early returns below so the hook order stays stable.
  const rules = useSearch<any>(data?.rules, q, (rule) => [
    rule.name,
    rule.code,
    rule.category,
    rule.computationType,
    rule.formula,
    rule.sequence,
  ]);

  if (isLoading) return <LoadingBlock rows={8} />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/payroll/structures" className="hover:text-brand">
            Salary Structures
          </Link>
        }
        title={data.name}
        subtitle={`${data.rules.length} rules · used by ${data._count.contracts} contract(s)`}
        action={
          canEdit && (
            <Button
              variant="primary"
              onClick={() =>
                setEditing({
                  structureId: id,
                  category: 'ALLOWANCE',
                  computationType: 'FIXED',
                  sequence: (data.rules.at(-1)?.sequence ?? 0) + 10,
                  quantity: 1,
                  isActive: true,
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rule
            </Button>
          )
        }
      />

      <Card>
        <CardHeader
          title="Salary Rules"
          subtitle="Executed top to bottom. Later rules can read earlier results."
          action={
            <SearchInput
              value={q}
              onChange={setQ}
              count={rules.length}
              placeholder="Search rules…"
              className="w-full sm:w-60"
            />
          }
        />
        {data.rules.length > 0 && rules.length === 0 && (
          <NoResults query={q} onClear={() => setQ('')} noun="rules" />
        )}
        {rules.length > 0 && (
        <TableWrap>
          <thead>
            <tr>
              <Th align="right" className="w-16">
                Seq
              </Th>
              <Th>Rule</Th>
              <Th>Code</Th>
              <Th>Category</Th>
              <Th>Computation</Th>
              <Th align="right">Value</Th>
              {canEdit && <Th align="right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {rules.map((rule: any) => (
              <Tr key={rule.id}>
                <Td align="right" className="tabular text-faint">
                  {rule.sequence}
                </Td>
                <Td className="font-medium">{rule.name}</Td>
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
                <Td className="text-muted">
                  {rule.computationType === 'FIXED' && 'Fixed Amount'}
                  {rule.computationType === 'PERCENTAGE' &&
                    `% of ${
                      BASES.find(([value]) => value === rule.percentageBase)?.[1] ?? 'wage'
                    }`}
                  {rule.computationType === 'FORMULA' && (
                    <code className="rounded bg-elevated px-1.5 py-0.5 text-[11px]">
                      {rule.formula}
                    </code>
                  )}
                </Td>
                <Td align="right" className="tabular">
                  {rule.computationType === 'FIXED'
                    ? money(rule.amountFixed)
                    : rule.computationType === 'PERCENTAGE'
                      ? `${Number(rule.percentage)}%`
                      : '—'}
                </Td>
                {canEdit && (
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(rule)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove.mutate(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </TableWrap>
        )}
      </Card>

      {editing && (
        <RuleEditor
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['salary-structure', id] });
            queryClient.invalidateQueries({ queryKey: ['salary-rules'] });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Rule editor                                                                 */
/* -------------------------------------------------------------------------- */

function RuleEditor({
  rule,
  onClose,
  onSaved,
}: {
  rule: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({
    name: rule.name ?? '',
    code: rule.code ?? '',
    sequence: rule.sequence ?? 10,
    category: rule.category ?? 'ALLOWANCE',
    computationType: rule.computationType ?? 'FIXED',
    amountFixed: rule.amountFixed ?? '',
    percentage: rule.percentage ?? '',
    percentageBase: rule.percentageBase ?? 'CONTRACT_WAGE',
    formula: rule.formula ?? '',
    quantity: rule.quantity ?? 1,
    structureId: rule.structureId,
  });

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      rule.id
        ? api.patch(`/salary-rules/${rule.id}`, form)
        : api.post('/salary-rules', form),
    onSuccess: onSaved,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={rule.id ? `Edit rule — ${rule.name}` : 'New salary rule'}
      subtitle="Changing this immediately changes every payslip computed afterwards."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rule Name" required>
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Code" required hint="Referenced in formulas as rules['CODE'].">
            <Input
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Category" required>
            <Select
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category.charAt(0) + category.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sequence" required hint="Lower runs first.">
            <Input
              type="number"
              value={form.sequence}
              onChange={(e) => set({ sequence: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field label="Computation" required>
          <Select
            value={form.computationType}
            onChange={(e) => set({ computationType: e.target.value })}
          >
            <option value="FIXED">Fixed Amount</option>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FORMULA">Formula</option>
          </Select>
        </Field>

        {form.computationType === 'FIXED' && (
          <Field label="Amount" required>
            <Input
              type="number"
              value={form.amountFixed}
              onChange={(e) => set({ amountFixed: e.target.value })}
            />
          </Field>
        )}

        {form.computationType === 'PERCENTAGE' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Percentage" required>
              <Input
                type="number"
                step="0.01"
                value={form.percentage}
                onChange={(e) => set({ percentage: e.target.value })}
              />
            </Field>
            <Field label="Of" required>
              <Select
                value={form.percentageBase}
                onChange={(e) => set({ percentageBase: e.target.value })}
              >
                {BASES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {form.computationType === 'FORMULA' && (
          <Field
            label="Expression"
            required
            hint="Available: rules['CODE'], categories['BASIC'], wage, worked_days, expected_days, leave_days, unpaid_leave_days, overtime_hours"
          >
            <Textarea
              className="font-mono text-xs"
              value={form.formula}
              onChange={(e) => set({ formula: e.target.value })}
              placeholder="result = categories['BASIC'] + categories['ALLOWANCE']"
            />
          </Field>
        )}

        {save.isError && (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {(save.error as Error).message}
          </p>
        )}
      </div>
    </Modal>
  );
}
