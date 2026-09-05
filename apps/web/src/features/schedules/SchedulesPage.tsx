import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import * as React from 'react';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  NoResults,
  PageHeader,
  ReadField,
  SearchInput,
  Td,
  Th,
  TableWrap,
  Tr,
} from '../../components/ui';
import { api } from '../../lib/api';
import { titleCase } from '../../lib/format';
import { useSearch } from '../../lib/search';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function SchedulesPage() {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['working-schedules'],
    queryFn: () => api.get<any[]>('/working-schedules'),
  });

  const rows = useSearch(data, q, (schedule) => [
    schedule.name,
    titleCase(schedule.calendarType),
    schedule.company?.name,
    schedule.hoursPerWeek,
    schedule.daysPerWeek,
    schedule.isActive ? 'active' : 'inactive',
  ]);

  // Keep the detail pane on a row that is actually visible.
  const selected = rows.find((schedule) => schedule.id === openId) ?? rows[0];

  return (
    <>
      <PageHeader
        title="Working Schedules"
        subtitle="Weekly hours are derived from the pattern below — never typed in by hand."
        action={
          <SearchInput
            value={q}
            onChange={setQ}
            count={rows.length}
            placeholder="Search schedules…"
            className="w-full sm:w-64"
          />
        }
      />

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={4} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState icon={CalendarClock} title="No working schedules configured" />
        </Card>
      )}

      {data && data.length > 0 && rows.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ('')} noun="schedules" />
        </Card>
      )}

      {rows.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-5">
          {/* List */}
          <Card className="lg:col-span-3">
            <CardHeader
              title="Schedules"
              subtitle={
                q
                  ? `${rows.length} of ${data?.length ?? 0} shown`
                  : `${data?.length ?? 0} configured`
              }
            />
            <TableWrap>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Calendar Type</Th>
                  <Th align="right">Days / Week</Th>
                  <Th align="right">Hours / Week</Th>
                  <Th align="right">Assigned</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((schedule) => (
                  <Tr
                    key={schedule.id}
                    active={selected?.id === schedule.id}
                    onClick={() => setOpenId(schedule.id)}
                  >
                    <Td className="font-medium">{schedule.name}</Td>
                    <Td className="text-muted">{titleCase(schedule.calendarType)}</Td>
                    <Td align="right" className="tabular">
                      {schedule.daysPerWeek}
                    </Td>
                    <Td align="right" className="font-medium tabular">
                      {schedule.hoursPerWeek}h
                    </Td>
                    <Td align="right" className="tabular text-muted">
                      {schedule._count.employees + schedule._count.contracts}
                    </Td>
                    <Td align="right">
                      <Badge tone={schedule.isActive ? 'ok' : 'neutral'} dot>
                        {schedule.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          {/* Form view — weekly pattern */}
          {selected && (
            <Card className="lg:col-span-2">
              <CardHeader
                title={selected.name}
                subtitle="Day · Start · End · Break"
              />
              <div className="grid grid-cols-2 gap-4 border-b border-line p-5">
                <ReadField label="Calendar Type" value={titleCase(selected.calendarType)} />
                <ReadField label="Company" value={selected.company?.name} />
                <ReadField label="Days / Week" value={selected.daysPerWeek} />
                <ReadField
                  label="Hours / Week"
                  value={
                    <span className="text-brand">{selected.hoursPerWeek}h (derived)</span>
                  }
                />
              </div>

              <ul className="divide-y divide-line">
                {selected.lines.map((line: any) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <span className="font-medium">{DAYS[line.dayOfWeek] ?? '—'}</span>
                    <span className="flex items-center gap-3 tabular text-muted">
                      <span>
                        {line.startTime} – {line.endTime}
                      </span>
                      {line.breakMinutes > 0 && (
                        <Badge tone="neutral">{line.breakMinutes}m break</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="border-t border-line px-5 py-3 text-[11px] text-faint">
                Total = Σ((end − start) − break). Assigned to employees and contracts, and
                used by attendance and payroll as the expected working time.
              </p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
