import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Plus, X } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  NoResults,
  PageHeader,
  SearchInput,
  Select,
  StateBadge,
  Td,
  Th,
  TableWrap,
  Textarea,
  Tr,
} from '../../components/ui';
import { api, qs } from '../../lib/api';
import { HR_ROLES, useAuth } from '../../lib/auth';
import { shortDate } from '../../lib/format';
import { useSearch } from '../../lib/search';

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export function TimeOffRequestsPage() {
  const [params] = useSearchParams();
  const employeeId = params.get('employeeId') ?? '';
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canApprove = can(...HR_ROLES);

  const [state, setState] = React.useState('');
  const [q, setQ] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['time-off-requests', employeeId, state],
    queryFn: () => api.get<any[]>(`/time-off/requests${qs({ employeeId, state })}`),
  });

  const rows = useSearch(data, q, (request) => [
    request.employee,
    request.type?.name,
    request.state,
    request.description,
    shortDate(request.dateFrom),
    shortDate(request.dateTo),
  ]);

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'refuse' }) =>
      api.post(`/time-off/requests/${id}/${action}`),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
      queryClient.invalidateQueries({ queryKey: ['time-off-allocations'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
    },
    onError: (err) => setError((err as Error).message),
  });

  return (
    <>
      <PageHeader
        title="Time Off Requests"
        subtitle="Approving a request consumes the matching allocation balance."
        action={
          <>
            <SearchInput
              value={q}
              onChange={setQ}
              count={rows.length}
              placeholder="Search employee or leave type…"
              className="w-full sm:w-64"
            />
            <Select value={state} onChange={(e) => setState(e.target.value)} className="w-36">
              <option value="">All statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REFUSED">Refused</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Request
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-5 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {loadError && <ErrorBlock error={loadError} />}
      {isLoading && <LoadingBlock rows={6} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState icon={CalendarDays} title="No time off requests" />
        </Card>
      )}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="requests" />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th align="right">Duration</Th>
                <Th>Balance impact</Th>
                <Th align="right">Status</Th>
                {canApprove && <Th align="right">Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((request) => (
                <Tr key={request.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        firstName={request.employee.firstName}
                        lastName={request.employee.lastName}
                        avatarUrl={request.employee.avatarUrl}
                        gender={request.employee.gender}
                        size="sm"
                      />
                      <span className="truncate">
                        {request.employee.firstName} {request.employee.lastName}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone="brand">{request.type.name}</Badge>
                  </Td>
                  <Td className="tabular text-muted">
                    {shortDate(request.dateFrom)} → {shortDate(request.dateTo)}
                  </Td>
                  <Td align="right" className="tabular font-medium">
                    {Number(request.duration)}{' '}
                    {request.type.unit === 'DAY' ? 'day(s)' : 'hr(s)'}
                  </Td>
                  <Td className="text-xs text-muted">
                    {request.allocation
                      ? `Consumed from allocation (${Number(
                          request.allocation.takenQty,
                        )}/${Number(request.allocation.allocatedQty)})`
                      : request.type.requiresAllocation
                        ? 'Not yet linked'
                        : 'No allocation needed'}
                  </Td>
                  <Td align="right">
                    <StateBadge state={request.state} />
                  </Td>
                  {canApprove && (
                    <Td align="right">
                      {request.state === 'SUBMITTED' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="success"
                            loading={
                              decide.isPending && decide.variables?.id === request.id
                            }
                            onClick={() =>
                              decide.mutate({ id: request.id, action: 'approve' })
                            }
                          >
                            <Check className="h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              decide.mutate({ id: request.id, action: 'refuse' })
                            }
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {creating && <RequestEditor onClose={() => setCreating(false)} />}
    </>
  );
}

function RequestEditor({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const isHr = can(...HR_ROLES);

  const [form, setForm] = React.useState({
    employeeId: user?.employeeId ?? '',
    typeId: '',
    dateFrom: new Date().toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10),
    description: '',
  });

  const types = useQuery({
    queryKey: ['time-off-types'],
    queryFn: () => api.get<any[]>('/time-off/types'),
  });
  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<any[]>('/employees'),
    enabled: isHr,
  });

  React.useEffect(() => {
    if (!form.typeId && types.data?.length) {
      setForm((prev) => ({ ...prev, typeId: types.data[0].id }));
    }
  }, [types.data, form.typeId]);

  const save = useMutation({
    mutationFn: () => api.post('/time-off/requests', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="New time off request"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isHr && (
          <Field label="Employee" required>
            <Select
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            >
              <option value="">Select employee</option>
              {employees.data?.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Time Off Type" required>
          <Select
            value={form.typeId}
            onChange={(e) => setForm({ ...form, typeId: e.target.value })}
          >
            {types.data?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
                {type.requiresAllocation ? ' (needs allocation)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" required>
            <Input
              type="date"
              value={form.dateFrom}
              onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
            />
          </Field>
          <Field label="To" required>
            <Input
              type="date"
              value={form.dateTo}
              onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        {save.isError && (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {(save.error as Error).message}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Allocations                                                                 */
/* -------------------------------------------------------------------------- */

export function AllocationsPage() {
  const [params] = useSearchParams();
  const employeeId = params.get('employeeId') ?? '';
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can(...HR_ROLES);
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['time-off-allocations', employeeId],
    queryFn: () => api.get<any[]>(`/time-off/allocations${qs({ employeeId })}`),
  });

  const rows = useSearch(data, q, (allocation) => [
    allocation.employee,
    allocation.type?.name,
    allocation.state,
    shortDate(allocation.validFrom),
    shortDate(allocation.validTo),
  ]);

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/time-off/allocations/${id}/approve`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['time-off-allocations'] }),
  });

  return (
    <>
      <PageHeader
        title="Allocations"
        subtitle="An allocation becomes usable balance only once approved."
        action={
          <SearchInput
            value={q}
            onChange={setQ}
            count={rows.length}
            placeholder="Search employee or leave type…"
            className="w-full sm:w-72"
          />
        }
      />

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={6} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState icon={CalendarDays} title="No allocations" />
        </Card>
      )}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="allocations" />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Type</Th>
                <Th>Validity</Th>
                <Th align="right">Allocated</Th>
                <Th align="right">Taken</Th>
                <Th align="right">Remaining</Th>
                <Th align="right">Status</Th>
                {canManage && <Th align="right">Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((allocation) => {
                const allocated = Number(allocation.allocatedQty);
                const taken = Number(allocation.takenQty);
                return (
                  <Tr key={allocation.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          firstName={allocation.employee.firstName}
                          lastName={allocation.employee.lastName}
                          avatarUrl={allocation.employee.avatarUrl}
                          gender={allocation.employee.gender}
                          size="sm"
                        />
                        <span className="truncate">
                          {allocation.employee.firstName} {allocation.employee.lastName}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone="brand">{allocation.type.name}</Badge>
                    </Td>
                    <Td className="tabular text-muted">
                      {shortDate(allocation.validFrom)} → {shortDate(allocation.validTo)}
                    </Td>
                    <Td align="right" className="tabular">
                      {allocated}
                    </Td>
                    <Td align="right" className="tabular text-muted">
                      {taken}
                    </Td>
                    <Td align="right" className="font-semibold tabular">
                      {allocated - taken}
                    </Td>
                    <Td align="right">
                      <StateBadge state={allocation.state} />
                    </Td>
                    {canManage && (
                      <Td align="right">
                        {allocation.state === 'DRAFT' ? (
                          <Button
                            size="sm"
                            variant="success"
                            loading={approve.isPending}
                            onClick={() => approve.mutate(allocation.id)}
                          >
                            <Check className="h-3 w-3" />
                            Approve
                          </Button>
                        ) : (
                          <span className="text-xs text-faint">—</span>
                        )}
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export function TimeOffTypesPage() {
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['time-off-types'],
    queryFn: () => api.get<any[]>('/time-off/types'),
  });

  const rows = useSearch(data, q, (type) => [
    type.name,
    type.code,
    type.unit === 'DAY' ? 'days' : 'hours',
    type.isPaid ? 'paid' : 'unpaid',
    type.isActive ? 'active' : 'inactive',
    type.requiresAllocation ? 'needs allocation' : '',
    type.requiresApproval ? 'needs approval' : '',
    type.affectsPayroll ? 'affects payroll' : '',
  ]);

  return (
    <>
      <PageHeader
        title="Time Off Types"
        subtitle="Each type defines how that leave behaves — allocation, approval and payroll impact."
        action={
          <SearchInput
            value={q}
            onChange={setQ}
            count={rows.length}
            placeholder="Search types…"
            className="w-full sm:w-64"
          />
        }
      />

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={3} />}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="types" />
        </Card>
      )}

      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((type) => (
            <Card key={type.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: type.color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{type.name}</p>
                    <p className="truncate text-xs tabular text-muted">{type.code}</p>
                  </div>
                </div>
                <Badge tone={type.isActive ? 'ok' : 'neutral'} dot>
                  {type.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                <Badge tone="neutral">
                  Unit: {type.unit === 'DAY' ? 'Days' : 'Hours'}
                </Badge>
                {type.requiresAllocation && <Badge tone="info">Needs allocation</Badge>}
                {type.requiresApproval && <Badge tone="info">Needs approval</Badge>}
                <Badge tone={type.isPaid ? 'ok' : 'warn'}>
                  {type.isPaid ? 'Paid' : 'Unpaid'}
                </Badge>
                {type.affectsPayroll && <Badge tone="brand">Affects payroll</Badge>}
              </div>

              <p className="mt-4 text-xs text-muted">
                {type._count.requests} request(s) · {type._count.allocations} allocation(s)
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
