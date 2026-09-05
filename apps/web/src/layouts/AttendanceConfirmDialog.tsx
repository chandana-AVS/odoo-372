import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import * as React from 'react';
import { Button, Modal, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { cn, duration, money } from '../lib/format';

export interface CheckoutResult {
  id: string;
  workedHours: number | string;
  deltaHours: number;
  requiresConfirmation: boolean;
  suggestedType: 'EXTRA_TIME' | 'EARLY_LOGOUT';
  /** Present when this day already carries a request — suppresses the prompt. */
  request?: { id: string; state: string } | null;
}

/** "+1:30" / "-1:15" — the signed form the confirmation copy uses. */
function signedDuration(deltaHours: number): string {
  const sign = deltaHours >= 0 ? '+' : '-';
  return `${sign}${duration(Math.abs(deltaHours) * 60).replace('h', ':')}`;
}

/**
 * Shown after check-out when the day was not a standard 8 hours. The employee
 * picks whether the difference was extra time or an early logout, gives a
 * reason, and the request goes for review.
 */
export function AttendanceConfirmDialog({
  result,
  onClose,
  /** Shown under the title — e.g. the date when raised from the log. */
  subtitle,
}: {
  result: CheckoutResult;
  onClose: () => void;
  subtitle?: string;
}) {
  const queryClient = useQueryClient();
  const isExtra = result.deltaHours > 0;

  const [type, setType] = React.useState<'EXTRA_TIME' | 'EARLY_LOGOUT'>(
    result.suggestedType,
  );
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const worked = Number(result.workedHours);

  // What this overtime would be worth if HR approves it. Extra time only.
  const quote = useQuery<{
    hours: number;
    isWeekend: boolean;
    hourlyRate: number;
    multiplier: number;
    amount: number;
  } | null>({
    queryKey: ['attendance', 'quote', result.id],
    queryFn: () => api.get(`/attendance/requests/quote/${result.id}`),
    enabled: isExtra,
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post('/attendance/requests', {
        attendanceId: result.id,
        type,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setSubmitted(true);
    },
  });

  // Step 5 of the flow — the "request submitted" acknowledgement.
  if (submitted) {
    return (
      <Modal
        open
        onClose={onClose}
        size="sm"
        title="Request submitted"
        footer={
          <Button variant="primary" onClick={onClose}>
            OK
          </Button>
        }
      >
        <div className="flex flex-col items-center px-2 py-6 text-center">
          <span className="mb-4 rounded-full bg-ok/10 p-3">
            <CheckCircle2 className="h-7 w-7 text-ok" />
          </span>
          <p className="text-sm font-medium">Request submitted successfully</p>
          <p className="mt-1.5 max-w-xs text-xs text-muted">
            Your request has been sent for approval. You can track its status under
            Attendance → My Requests.
          </p>
        </div>
      </Modal>
    );
  }

  const reasonMissing = touched && !reason.trim();

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Attendance confirmation"
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onClose}>No</Button>
          <Button
            variant="primary"
            loading={submit.isPending}
            onClick={() => {
              setTouched(true);
              if (reason.trim()) submit.mutate();
            }}
          >
            Yes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-xs text-muted">Your total working time is</p>
          <p className="mt-1 text-3xl font-semibold tabular">{duration(worked * 60)}</p>
          <p className="mt-1.5 text-xs text-muted">
            This is{' '}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 font-medium tabular',
                isExtra ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger',
              )}
            >
              {signedDuration(result.deltaHours)} hrs
            </span>{' '}
            {isExtra ? 'more' : 'less'} than 8 hours.
          </p>
        </div>

        {/* Both options stay selectable — the delta only sets the default. */}
        <div className="space-y-2">
          {(
            [
              ['EXTRA_TIME', 'Extra Time'],
              ['EARLY_LOGOUT', 'Early Logout'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                type === value
                  ? 'border-brand bg-brand-soft/60'
                  : 'border-line hover:bg-elevated',
              )}
            >
              <input
                type="radio"
                name="attendance-request-type"
                className="accent-brand"
                checked={type === value}
                onChange={() => setType(value)}
              />
              <span className="font-medium">{label}</span>
              {result.suggestedType === value && (
                <span className="ml-auto tabular text-xs text-muted">
                  ({signedDuration(result.deltaHours)})
                </span>
              )}
            </label>
          ))}
        </div>

        {/* Overtime is only paid once HR approves it — say so plainly. */}
        {isExtra && type === 'EXTRA_TIME' && quote.data && (
          <div className="rounded-lg border border-line bg-elevated/60 px-3 py-2.5 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-muted">
                Overtime if approved
                {quote.data.isWeekend && (
                  <span className="ml-1.5 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-ink">
                    Weekend
                  </span>
                )}
              </span>
              <span className="text-sm font-semibold tabular">
                {money(quote.data.amount)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-faint">
              {quote.data.hours}h x {money(quote.data.hourlyRate)}/h x{' '}
              {quote.data.multiplier} — paid only if HR approves this request.
            </p>
          </div>
        )}

        <div>
          <Textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Please enter reason…"
            className="min-h-16"
          />
          {reasonMissing && (
            <p className="mt-1 text-[11px] text-danger">A reason is required.</p>
          )}
        </div>

        {submit.isError && (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {(submit.error as Error).message}
          </p>
        )}
      </div>
    </Modal>
  );
}
