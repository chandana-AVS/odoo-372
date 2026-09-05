import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut } from 'lucide-react';
import * as React from 'react';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { cn, duration, time } from '../lib/format';
import { AttendanceConfirmDialog, type CheckoutResult } from './AttendanceConfirmDialog';

interface CurrentSession {
  checkedIn: boolean;
  session: { id: string; checkIn: string } | null;
  elapsedMinutes: number;
  todayHours: number;
}

/**
 * The navbar attendance control from the mockup:
 *   red icon  -> no open session -> "Check In"
 *   green icon -> checked in     -> "Check Out" + live elapsed time
 */
export function AttendanceWidget() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  /** Set when a check-out came back off-target, which opens the dialog. */
  const [confirming, setConfirming] = React.useState<CheckoutResult | null>(null);
  const anchor = React.useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['attendance', 'current'],
    queryFn: () => api.get<CurrentSession>('/attendance/current'),
    refetchInterval: 60_000,
  });

  // Tick every second so the elapsed counter is genuinely live.
  React.useEffect(() => {
    if (!data?.checkedIn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [data?.checkedIn]);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = useMutation({
    mutationFn: () =>
      api.post<CheckoutResult | null>(
        data?.checkedIn ? '/attendance/check-out' : '/attendance/check-in',
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setOpen(false);
      // Exactly 8 hours passes silently; anything else asks for a reason.
      // Only prompt for a genuinely fresh check-out. A day that already carries
      // a request must never re-open the dialog on navigation.
      if (result?.requiresConfirmation && !result.request) setConfirming(result);
    },
  });

  const checkedIn = Boolean(data?.checkedIn);
  // Never negative: the server's clock can be marginally ahead of the browser.
  const elapsed = data?.session
    ? Math.max(0, Math.floor((now - new Date(data.session.checkIn).getTime()) / 60000))
    : 0;

  return (
    <div className="relative" ref={anchor}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={checkedIn ? 'Check out' : 'Check in'}
        className={cn(
          'relative flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium transition-colors',
          checkedIn
            ? 'border-ok/30 bg-ok/10 text-ok hover:bg-ok/15'
            : 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/15',
        )}
      >
        <span className="relative flex h-2 w-2">
          {checkedIn && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
          )}
          <span
            className={cn(
              'relative inline-flex h-2 w-2 rounded-full',
              checkedIn ? 'bg-ok' : 'bg-danger',
            )}
          />
        </span>
        <span className="hidden tabular sm:inline">
          {checkedIn ? duration(elapsed) : 'Check in'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-4 shadow-pop animate-fade-up">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted">
            <Clock className="h-3.5 w-3.5" />
            {checkedIn ? 'Session in progress' : 'No active session'}
          </div>

          {checkedIn && data?.session ? (
            <>
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm">{time(data.session.checkIn)} — Now</span>
                <span className="tabular text-lg font-semibold">{duration(elapsed)}</span>
              </div>
              <div className="mb-4 flex items-baseline justify-between border-t border-line pt-3 text-xs">
                <span className="text-muted">Today</span>
                <span className="tabular font-medium">
                  {duration((data.todayHours ?? 0) * 60)}
                </span>
              </div>
              <Button
                variant="danger"
                className="w-full justify-center"
                loading={toggle.isPending}
                onClick={() => toggle.mutate()}
              >
                <LogOut className="h-3.5 w-3.5" />
                Check Out
              </Button>
            </>
          ) : (
            <>
              <p className="mb-4 text-xs text-muted">
                Start your day — your worked hours feed attendance reporting and payroll.
              </p>
              <Button
                variant="success"
                className="w-full justify-center"
                loading={toggle.isPending}
                onClick={() => toggle.mutate()}
              >
                <LogIn className="h-3.5 w-3.5" />
                Check In
              </Button>
            </>
          )}

          {toggle.isError && (
            <p className="mt-2 text-[11px] text-danger">
              {(toggle.error as Error).message}
            </p>
          )}
        </div>
      )}

      {confirming && (
        <AttendanceConfirmDialog
          result={confirming}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
