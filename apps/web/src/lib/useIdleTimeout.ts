import * as React from "react";

/** How long a session may sit idle before it is ended. */
export const IDLE_LIMIT_MS = 60_000;
/** How long the "you are about to be signed out" warning shows. Must stay
 *  well under IDLE_LIMIT_MS, or the warning appears the moment you sign in. */
export const IDLE_WARNING_MS = 15_000;

/** Shared across tabs, so activity in one keeps the others alive. */
const LAST_ACTIVITY_KEY = "pp360.lastActivity";

/** Events that count as the user being present. */
const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "wheel",
  "touchstart",
  "visibilitychange",
] as const;

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  } catch {
    return Date.now();
  }
}

function writeLastActivity(at: number) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    /* private mode — the in-memory timer still works for this tab */
  }
}

/**
 * Signs the user out after a period of inactivity, warning them first.
 *
 * Entirely local: a timestamp in localStorage plus a one-second tick. No
 * external service, no server polling. The server's JWT expiry is the real
 * security boundary — this is the "walked away from the desk" guard that a
 * long-lived token cannot provide on its own.
 *
 * The timestamp is shared through localStorage so activity in any tab keeps
 * every tab alive, and a sign-out in one is noticed by the others.
 */
export function useIdleTimeout({
  enabled,
  onTimeout,
}: {
  enabled: boolean;
  onTimeout: () => void;
}) {
  const [msLeft, setMsLeft] = React.useState<number | null>(null);
  // Held in a ref so the interval never needs re-creating when it changes.
  const onTimeoutRef = React.useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const recordActivity = React.useCallback(() => {
    writeLastActivity(Date.now());
    setMsLeft(null);
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      setMsLeft(null);
      return;
    }

    writeLastActivity(Date.now());

    const onActivity = () => {
      // A tab being hidden is not activity; being shown again is.
      if (document.visibilityState === "hidden") return;
      writeLastActivity(Date.now());
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const tick = setInterval(() => {
      const idleFor = Date.now() - readLastActivity();
      const remaining = IDLE_LIMIT_MS - idleFor;

      if (remaining <= 0) {
        setMsLeft(null);
        onTimeoutRef.current();
        return;
      }
      // Only surface a countdown once we are inside the warning window.
      setMsLeft(remaining <= IDLE_WARNING_MS ? remaining : null);
    }, 1000);

    return () => {
      clearInterval(tick);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [enabled]);

  return { msLeft, recordActivity };
}
