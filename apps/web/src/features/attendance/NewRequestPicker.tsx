import { useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import * as React from 'react';
import { Button, EmptyState, LoadingBlock, Modal } from '../../components/ui';
import { AttendanceConfirmDialog, type CheckoutResult } from '../../layouts/AttendanceConfirmDialog';
import { api, qs } from '../../lib/api';
import { cn, duration, shortDate } from '../../lib/format';

const STANDARD_DAY_HOURS = 8;
/** Matches the server's tolerance — ~2 minutes either side of 8h. */
const GRACE_HOURS = 0.034;

interface AttendanceRow {
  id: string;
  date: string;
  workedHours: string | number;
  checkOut: string | null;
  request: { id: string; state: string; type: string } | null;
}

/** "+1:30" / "-1:15" */
const signed = (delta: number) =>
  `${delta >= 0 ? '+' : '-'}${duration(Math.abs(delta) * 60).replace('h', ':')}`;

/**
 * Lets an employee raise a request for a past day, rather than only in the
 * moment they check out. Lists completed days that were not 8 hours and do not
 * already carry a request.
 */
export function NewRequestPicker({
  employeeId,
  onClose,
}: {
  employeeId: string;
  onClose: () => void;
}) {
  const [chosen, setChosen] = React.useState<CheckoutResult | null>(null);
  const [chosenDate, setChosenDate] = React.useState<string>('');

  // Last 60 days is plenty for explaining a missed day.
  const from = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', employeeId, from, 'eligible'],
    // One large page: the list is filtered client-side down to eligible days.
    queryFn: () =>
      api
        .get<{ rows: AttendanceRow[] }>(`/attendance${qs({ employeeId, from, pageSize: 200 })}`)
        .then((r) => r.rows),
  });

  const eligible = React.useMemo(
    () =>
      (data ?? [])
        .filter((row) => {
          if (!row.checkOut) return false; // still open — check out first
          if (row.request) return false; // already explained
          const delta = Number(row.workedHours) - STANDARD_DAY_HOURS;
          return Math.abs(delta) > GRACE_HOURS;
        })
        .slice(0, 40),
    [data],
  );

  if (chosen) {
    return (
      <AttendanceConfirmDialog
        result={chosen}
        subtitle={chosenDate}
        onClose={() => {
          setChosen(null);
          onClose();
        }}
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Raise an attendance request"
      subtitle="Pick the day you need to explain. Only days that were not a standard 8 hours appear here."
      footer={<Button onClick={onClose}>Cancel</Button>}
    >
      {isLoading && <LoadingBlock rows={5} />}

      {!isLoading && eligible.length === 0 && (
        <EmptyState
          icon={CalendarCheck}
          title="Nothing to explain"
          description="Every completed day in the last 60 days was either a standard 8 hours or already has a request."
        />
      )}

      {eligible.length > 0 && (
        <ul className="divide-y divide-line">
          {eligible.map((row) => {
            const worked = Number(row.workedHours);
            const delta = Math.round((worked - STANDARD_DAY_HOURS) * 100) / 100;
            const isExtra = delta > 0;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    setChosenDate(shortDate(row.date));
                    setChosen({
                      id: row.id,
                      workedHours: worked,
                      deltaHours: delta,
                      requiresConfirmation: true,
                      suggestedType: isExtra ? 'EXTRA_TIME' : 'EARLY_LOGOUT',
                    });
                  }}
                  className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors hover:bg-elevated"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{shortDate(row.date)}</span>
                    <span className="block text-xs text-muted">
                      Worked {duration(worked * 60)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-2 py-1 text-xs font-medium tabular',
                      isExtra ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger',
                    )}
                  >
                    {signed(delta)} hrs
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
