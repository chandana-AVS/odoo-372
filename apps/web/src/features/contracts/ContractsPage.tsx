import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  Button,
  EmptyState,
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
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { money, shortDate } from '../../lib/format';
import { useSearch } from '../../lib/search';
import { NewHireEditor } from './NewHireEditor';

export function ContractsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const employeeId = params.get('employeeId') ?? '';
  // Onboarding a person is an admin action — HR roles can still read the list.
  const { can } = useAuth();
  const canOnboard = can('ADMIN');

  const [q, setQ] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['contracts', employeeId],
    queryFn: () => api.get<any[]>(`/contracts${qs({ employeeId })}`),
  });

  const rows = useSearch(data, q, (contract) => [
    contract.reference,
    contract.employee,
    contract.status,
    contract.structureType,
    contract.salaryStructure?.name,
    contract.department?.name,
    contract.jobPosition?.name,
    contract.wage,
    contract.startDate && shortDate(contract.startDate),
    contract.endDate && shortDate(contract.endDate),
  ]);

  return (
    <>
      <PageHeader
        title="Contracts"
        subtitle={
          employeeId
            ? 'Filtered to one employee — the running contract is highlighted.'
            : 'Historical records are kept; only the running contract drives payroll.'
        }
        action={
          <>
            <SearchInput
              value={q}
              onChange={setQ}
              count={rows.length}
              placeholder="Search reference, employee or structure…"
              className="w-full sm:w-72"
            />
            {canOnboard && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Employee & Contract
              </Button>
            )}
          </>
        }
      />

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={5} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState icon={FileText} title="No contracts found" />
        </Card>
      )}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="contracts" />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Employee</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th align="right">Wage / Month</Th>
                <Th>Structure</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((contract) => (
                <Tr
                  key={contract.id}
                  active={contract.status === 'RUNNING'}
                  onClick={() => navigate(`/contracts/${contract.id}`)}
                >
                  <Td className="font-medium tabular">{contract.reference}</Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        firstName={contract.employee.firstName}
                        lastName={contract.employee.lastName}
                        size="sm"
                      />
                      <span className="truncate">
                        {contract.employee.firstName} {contract.employee.lastName}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-muted tabular">{shortDate(contract.startDate)}</Td>
                  <Td className="text-muted tabular">
                    {contract.endDate ? shortDate(contract.endDate) : '—'}
                  </Td>
                  <Td align="right" className="font-medium tabular">
                    {money(contract.wage)}
                  </Td>
                  <Td className="text-muted">{contract.salaryStructure?.name ?? '—'}</Td>
                  <Td align="right">
                    <StateBadge state={contract.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {creating && (
        <NewHireEditor
          onClose={() => setCreating(false)}
          onSaved={(contract) => navigate(`/contracts/${contract.id}`)}
        />
      )}
    </>
  );
}

export function ContractDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['contract', id],
    queryFn: () => api.get<any>(`/contracts/${id}`),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/contracts" className="hover:text-brand">
            Contracts
          </Link>
        }
        title={data.reference}
        subtitle={`${data.employee.firstName} ${data.employee.lastName}`}
        action={<StateBadge state={data.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Contract Terms" />
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <ReadField
              label="Employee"
              value={
                <Link
                  to={`/employees/${data.employee.id}`}
                  className="text-brand hover:underline"
                >
                  {data.employee.firstName} {data.employee.lastName}
                </Link>
              }
            />
            <ReadField label="Department" value={data.department?.name} />
            <ReadField label="Job Position" value={data.jobPosition?.name} />
            <ReadField label="Start Date" value={shortDate(data.startDate)} />
            <ReadField
              label="End Date"
              value={data.endDate ? shortDate(data.endDate) : 'Open-ended'}
            />
            <ReadField label="Wage / Month" value={money(data.wage)} />
            <ReadField label="Working Schedule" value={data.workingSchedule?.name} />
            <ReadField label="Salary Structure" value={data.salaryStructure?.name} />
            <ReadField label="Structure Type" value={data.structureType} />
          </div>

          {data.notes && (
            <div className="border-t border-line px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
                Notes
              </p>
              <p className="mt-1 text-sm text-muted">{data.notes}</p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Applied Salary Rules"
            subtitle="What payroll will compute for this contract"
          />
          {data.salaryStructure ? (
            <ul className="divide-y divide-line">
              {data.salaryStructure.rules.map((rule: any) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-6 text-[11px] tabular text-faint">
                      {rule.sequence}
                    </span>
                    <span className="truncate text-sm">{rule.name}</span>
                  </span>
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
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-warn">
              No salary structure — payroll cannot compute this contract.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
