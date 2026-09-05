import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

export const money = (value: number | string | null | undefined, precise = false) =>
  value === null || value === undefined
    ? '—'
    : (precise ? inrPrecise : inr).format(Number(value));

/** 1_520_000 -> "15.2L" — matches the dashboard chart labels in the mockup. */
export function compactMoney(value: number): string {
  const n = Number(value);
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`;
  return `₹${n}`;
}

export const shortDate = (value: string | Date | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export const dayMonth = (value: string | Date) =>
  new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export const time = (value: string | Date | null | undefined) =>
  value
    ? new Date(value).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '—';

/** 416 -> "6h56" (the elapsed format used by the attendance widget). */
export function duration(minutes: number): string {
  // Clamp at zero: a few seconds of clock skew between server and browser used
  // to render as "-1h-1" the instant someone checked in.
  const safe = Math.max(0, minutes);
  const h = Math.floor(safe / 60);
  const m = Math.floor(safe % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

export const initials = (first?: string, last?: string) =>
  `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';

export const fullName = (p?: { firstName?: string; lastName?: string } | null) =>
  p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '—';

export const titleCase = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

/** Deterministic avatar tint so the same person keeps the same colour. */
export function avatarTint(seed: string): string {
  const tints = [
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  ];
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tints[hash % tints.length];
}

export const monthInput = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** First and last day of a "YYYY-MM" period. */
export function monthRange(period: string) {
  const [year, month] = period.split('-').map(Number);
  return {
    start: `${period}-01`,
    end: new Date(year, month, 0).toISOString().slice(0, 10),
    label: new Date(year, month - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Validate a phone number: exactly 10 digits, starting 6-9.
 *
 * Spaces, hyphens and brackets are ignored, and a leading +91 is accepted and
 * stripped, so "+91 98765 43210" and "9876543210" are both fine. Placeholder
 * runs such as 1111111111 are rejected.
 *
 * @returns an error message, or null when the value is acceptable
 */
export function phoneError(value: string): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null; // optional field — emptiness is handled by the caller

  // Strip an optional +91 country code, then require exactly 10 digits.
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);

  if (digits.length !== 10) return 'Enter a 10-digit phone number.';

  // The same digit ten times over is never a real number.
  const allSame = digits.split('').every((d) => d === digits[0]);
  if (allSame) {
    return 'That does not look like a real number.';
  }
  // A number running straight up from 0 is placeholder data.
  if (digits === '0123456789') return 'That does not look like a real number.';

  if (!/^[6-9]/.test(digits)) {
    return 'A mobile number starts with 6, 7, 8 or 9.';
  }

  return null;
}

