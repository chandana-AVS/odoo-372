import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileClock, X } from 'lucide-react';
import * as React from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Input,
  LoadingBlock,
  NoResults,
  PageHeader,
  SearchInput,
  StateBadge,
  Tabs,
  Td,
  Th,
  TableWrap,
  Tr,
} from '../../components/ui';
import { api, qs } from '../../lib/api';
import { duration, money, shortDate } from '../../lib/format';
import { useSearch } from '../../lib/search';

interface RequestRow {
  id: string;
  date: string;
  workedHours: string | number;
  deltaHours: string | number;
  type: 'EXTRA_TIME' | 'EARLY_LOGOUT';
  reason: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED';
  isWeekend: boolean;
  approvedAmount: string | number | null;
  decisionNote: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    code: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
    avatarUrl?: string | null;
  };
  decidedBy: { email: string } | null;
}

/** "+1:30" / "-1:15" */
const signed = (delta: number) =>
  `${delta >= 0 ? '+' : '-'}${duration(Math.abs(delta) * 60).replace('h', ':')}`;

/**
 * HR review queue for attendance requests. Approving extra time prices the
 * overtime server-side and writes it onto the request, so payroll pays exactly
 * what was approved here.
 */
export function AttendanceRequestsPage() {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState('PENDING');
  const [q, setQ] = React.useState('');
  /** Per-row decision note, keyed by request id. */
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['attendance', 'requests', 'all', state],
    queryFn: () => api.get<RequestRow[]>(`/attendance/requests${qs({ state })}`),
  });

  const counts = useQuery({
    queryKey: ['attendance', 'requests', 'all', ''],
    queryFn: () => api.get<RequestRow[]>('/attendance/requests'),
  });

  const decide = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'APPROVED' | 'REJECTED' }) =>
      api.patch(`/attendance/requests/${id}`, { state: next, note: notes[id] ?? '' }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['payslip'] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const rows = useSearch(data, q, (row) => [
    row.employee,
    row.reason,
    row.type,
    row.state,
    row.decisionNote,
    shortDate(row.date),
  ]);

  const tally = (value: string) =>
    (counts.data ?? []).filter((r) => r.state === value).length;

  return (
    <>
      <PageHeader
        title="Attendance Requests"
        subtitle="Approve extra time to add overtime pay to the employee's next payslip. Rejected requests earn nothing."
        action={
          <SearchInput
            value={q}
            onChange={setQ}
            count={rows.length}
            placeholder="Search employee or reason…"
            className="w-full sm:w-72"
          />
        }
      />

      {error && (
        <div className="mb-5 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Tabs
        value={state}
        onChange={setState}
        tabs={[
          { value: 'PENDING', label: 'Pending', count: tally('PENDING') },
          { value: 'APPROVED', label: 'Approved', count: tally('APPROVED') },
          { value: 'REJECTED', label: 'Rejected', count: tally('REJECTED') },
          { value: '', label: 'All', count: counts.data?.length ?? 0 },
        ]}
      />

      <div className="mt-5">
        {loadError && <ErrorBlock error={loadError} />}
        {isLoading && <LoadingBlock rows={6} />}

        {data && data.length === 0 && (
          <Card>
            <EmptyState
              icon={FileClock}
              title={
                state === 'PENDING'
                  ? 'Nothing waiting for review'
                  : 'No requests in this state'
              }
              description="Requests appear here when an employee checks out after more or less than 8 hours."
            />
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
                  <Th>Date</Th>
                  <Th align="right">Worked</Th>
                  <Th>Type</Th>
                  <Th>Reason</Th>
                  <Th align="right">Overtime</Th>
                  <Th align="right">Status</Th>
                  {state === 'PENDING' && <Th align="right">Decision</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const delta = Number(row.deltaHours);
                  const pending = row.state === 'PENDING';
                  const busy = decide.isPending && decide.variables?.id === row.id;
                  return (
                    <Tr key={row.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            firstName={row.employee.firstName}
                            lastName={row.employee.lastName}
                            avatarUrl={row.employee.avatarUrl}
                            gender={row.employee.gender}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {row.employee.firstName} {row.employee.lastName}
                            </p>
                            <p className="truncate text-xs tabular text-muted">
                              {row.employee.code}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="tabular text-muted">
                        {shortDate(row.date)}
                        {row.isWeekend && (
                          <Badge tone="brand" className="ml-1.5">
                            Weekend
                          </Badge>
                        )}
                      </Td>
                      <Td align="right" className="font-medium tabular">
                        {duration(Number(row.workedHours) * 60)}
                      </Td>
                      <Td>
                        <Badge tone={delta >= 0 ? 'info' : 'warn'}>
                          {row.type === 'EXTRA_TIME' ? 'Extra Time' : 'Early Logout'} (
                          {signed(delta)})
                        </Badge>
                      </Td>
                      <Td className="max-w-[220px] text-muted">
                        <span className="block truncate" title={row.reason}>
                          {row.reason}
                        </span>
                        {row.decisionNote && (
                          <span className="mt-0.5 block truncate text-[11px] text-faint">
                            Note: {row.decisionNote}
                          </span>
                        )}
                      </Td>
                      <Td align="right" className="font-semibold tabular">
                        {row.approvedAmount ? money(Number(row.approvedAmount)) : '—'}
                      </Td>
                      <Td align="right">
                        <StateBadge state={row.state} />
                      </Td>
                      {state === 'PENDING' && (
                        <Td align="right">
                          {pending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Input
                                placeholder="Note (optional)"
                                value={notes[row.id] ?? ''}
                                onChange={(e) =>
                                  setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                                }
                                className="h-8 w-36 text-xs"
                              />
                              <Button
                                size="sm"
                                variant="success"
                                loading={busy}
                                onClick={() =>
                                  decide.mutate({ id: row.id, next: 'APPROVED' })
                                }
                              >
                                <Check className="h-3 w-3" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  decide.mutate({ id: row.id, next: 'REJECTED' })
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
                  );
                })}
              </tbody>
            </TableWrap>
          </Card>
        )}
      </div>
    </>
  );
}
