import { useQuery } from '@tanstack/react-query';
import { FileClock } from 'lucide-react';
import * as React from 'react';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  NoResults,
  SearchInput,
  StateBadge,
  Td,
  Th,
  TableWrap,
  Tr,
} from '../../components/ui';
import { api, qs } from '../../lib/api';
import { duration, shortDate } from '../../lib/format';
import { useSearch } from '../../lib/search';

interface AttendanceRequestRow {
  id: string;
  date: string;
  workedHours: string | number;
  deltaHours: string | number;
  type: 'EXTRA_TIME' | 'EARLY_LOGOUT';
  reason: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED';
  decisionNote: string | null;
  decidedAt: string | null;
  employee: { firstName: string; lastName: string; code: string };
}

/** "+1:30" / "-1:15" */
function signed(delta: number): string {
  return `${delta >= 0 ? '+' : '-'}${duration(Math.abs(delta) * 60).replace('h', ':')}`;
}

/**
 * The employee's own explanation requests and where each one stands.
 * Mirrors step 9 of the flow — the employee can see the outcome.
 */
export function MyRequestsTable({ employeeId }: { employeeId: string }) {
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance', 'requests', employeeId],
    queryFn: () =>
      api.get<AttendanceRequestRow[]>(`/attendance/requests${qs({ employeeId })}`),
  });

  const rows = useSearch(data, q, (row) => [
    row.type === 'EXTRA_TIME' ? 'extra time' : 'early logout',
    row.state,
    row.reason,
    row.decisionNote,
    shortDate(row.date),
    row.workedHours,
  ]);

  if (error) return <ErrorBlock error={error} />;
  if (isLoading) return <LoadingBlock rows={5} />;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState
          icon={FileClock}
          title="No attendance requests"
          description="When you check out after more or less than 8 hours, the reason you give appears here with its approval status."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="border-b border-line p-3">
        <SearchInput
          value={q}
          onChange={setQ}
          count={rows.length}
          placeholder="Search reason, type or status…"
          className="sm:max-w-sm"
        />
      </div>

      {rows.length === 0 ? (
        <NoResults query={q} onClear={() => setQ('')} noun="requests" />
      ) : (
      <TableWrap>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th align="right">Total Time</Th>
            <Th>Type</Th>
            <Th>Reason</Th>
            <Th>Decision note</Th>
            <Th align="right">Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const delta = Number(row.deltaHours);
            return (
              <Tr key={row.id}>
                <Td className="tabular text-muted">{shortDate(row.date)}</Td>
                <Td align="right" className="font-medium tabular">
                  {duration(Number(row.workedHours) * 60)}
                </Td>
                <Td>
                  <Badge tone={delta >= 0 ? 'info' : 'warn'}>
                    {row.type === 'EXTRA_TIME' ? 'Extra Time' : 'Early Logout'} (
                    {signed(delta)})
                  </Badge>
                </Td>
                <Td className="max-w-[240px] text-muted">
                  <span className="block truncate" title={row.reason}>
                    {row.reason}
                  </span>
                </Td>
                <Td className="max-w-[200px] truncate text-xs text-muted">
                  {row.decisionNote ?? '—'}
                </Td>
                <Td align="right">
                  <StateBadge state={row.state} />
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </TableWrap>
      )}
    </Card>
  );
}
