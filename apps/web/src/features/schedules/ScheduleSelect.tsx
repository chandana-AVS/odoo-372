import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import * as React from 'react';
import { Button, Input, NumberInput, Select } from '../../components/ui';
import { api } from '../../lib/api';

const ADD_NEW = '__add_new__';

const DAYS = [
  ['Mon', 0],
  ['Tue', 1],
  ['Wed', 2],
  ['Thu', 3],
  ['Fri', 4],
  ['Sat', 5],
  ['Sun', 6],
] as const;

interface Schedule {
  id: string;
  name: string;
  hoursPerWeek?: number;
}

/** Minutes between two "HH:MM" times, rolling over midnight for night shifts. */
function spanMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let span = eh * 60 + em - (sh * 60 + sm);
  if (span <= 0) span += 24 * 60;
  return span;
}

/**
 * Working-schedule picker with inline creation.
 *
 * A schedule is a weekly pattern, not just a name, so the inline form asks for
 * the working days and their start/end times. Weekly hours are derived from
 * that pattern rather than typed, matching how the schedules page presents them.
 */
export function ScheduleSelect({
  value,
  onChange,
  canCreate = true,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  canCreate?: boolean;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [start, setStart] = React.useState('09:00');
  const [end, setEnd] = React.useState('18:00');
  const [breakMinutes, setBreakMinutes] = React.useState('60');
  const [days, setDays] = React.useState<number[]>([0, 1, 2, 3, 4]);

  const schedules = useQuery({
    queryKey: ['working-schedules'],
    queryFn: () => api.get<Schedule[]>('/working-schedules'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<Schedule>('/working-schedules', {
        name: name.trim(),
        calendarType: 'FULL_TIME',
        lines: days.map((dayOfWeek) => ({
          dayOfWeek,
          startTime: start,
          endTime: end,
          breakMinutes: Number(breakMinutes) || 0,
        })),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['working-schedules'] });
      onChange(created.id);
      reset();
    },
  });

  const reset = () => {
    setName('');
    setStart('09:00');
    setEnd('18:00');
    setBreakMinutes('60');
    setDays([0, 1, 2, 3, 4]);
    setAdding(false);
    create.reset();
  };

  const toggleDay = (day: number) =>
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );

  // Derived, never typed — the same rule the schedules page states.
  const weeklyHours =
    days.length > 0
      ? Math.round(
          ((spanMinutes(start, end) - (Number(breakMinutes) || 0)) * days.length) / 6,
        ) / 10
      : 0;

  const crossesMidnight = spanMinutes(start, end) > 0 && end <= start;
  const valid = name.trim() && days.length > 0 && weeklyHours > 0;

  if (adding) {
    return (
      <div className="space-y-3 rounded-lg border border-line bg-elevated/40 p-3">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Night Shift (8pm-4am)"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              reset();
            }
          }}
        />

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-muted">Working days</p>
          <div className="flex flex-wrap gap-1">
            {DAYS.map(([label, day]) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={
                  days.includes(day)
                    ? 'rounded-md border border-brand bg-brand-soft px-2 py-1 text-xs font-medium text-brand-ink'
                    : 'rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-elevated'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Start</span>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">End</span>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Break (min)</span>
            <NumberInput value={breakMinutes} onChange={setBreakMinutes} />
          </label>
        </div>

        <p className="text-[11px] text-muted">
          {weeklyHours > 0 ? (
            <>
              <span className="font-medium text-ink">{weeklyHours}h / week</span> across{' '}
              {days.length} day{days.length === 1 ? '' : 's'}
              {crossesMidnight && ' · crosses midnight'}
            </>
          ) : (
            'Pick at least one day and a valid time range.'
          )}
        </p>

        {create.isError && (
          <p className="text-[11px] text-danger">{(create.error as Error).message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={reset}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!valid}
            loading={create.isPending}
            onClick={() => valid && create.mutate()}
          >
            <Check className="h-3.5 w-3.5" />
            Add schedule
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === ADD_NEW) setAdding(true);
        else onChange(e.target.value);
      }}
    >
      <option value="">Select schedule</option>
      {schedules.data?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.hoursPerWeek ? ` (${s.hoursPerWeek}h/week)` : ''}
        </option>
      ))}
      {canCreate && <option value={ADD_NEW}>+ Other — add new schedule…</option>}
    </Select>
  );
}
