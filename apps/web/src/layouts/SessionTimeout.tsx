import { Clock } from 'lucide-react';
import * as React from 'react';
import { Button, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useIdleTimeout } from '../lib/useIdleTimeout';

/**
 * Ends an idle session, warning the user a minute before.
 *
 * The server's JWT expiry is the security boundary; this covers the case a
 * long-lived token cannot — someone walking away from a signed-in machine.
 */
export function SessionTimeout() {
  const { user, logout } = useAuth();

  const signOut = React.useCallback(() => {
    logout();
    // A full navigation clears any component state holding payroll data.
    window.location.href = '/login?reason=idle';
  }, [logout]);

  const { msLeft, recordActivity } = useIdleTimeout({
    enabled: Boolean(user),
    onTimeout: signOut,
  });

  if (!user || msLeft === null) return null;

  const seconds = Math.max(0, Math.ceil(msLeft / 1000));

  return (
    <Modal
      open
      size="sm"
      // Dismissing the dialog is itself a sign of life.
      onClose={recordActivity}
      title="Still there?"
      footer={
        <>
          <Button onClick={signOut}>Sign out now</Button>
          <Button variant="primary" onClick={recordActivity}>
            Stay signed in
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center px-2 py-5 text-center">
        <span className="mb-4 rounded-full bg-warn/10 p-3">
          <Clock className="h-6 w-6 text-warn" />
        </span>
        <p className="text-sm">
          You will be signed out in{' '}
          <span className="font-semibold tabular text-ink">{seconds}s</span> due to
          inactivity.
        </p>
        <p className="mt-1.5 max-w-xs text-xs text-muted">
          This protects payroll data if the machine is left unattended.
        </p>
      </div>
    </Modal>
  );
}
