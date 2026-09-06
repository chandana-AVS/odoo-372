import { AlertTriangle, Check, Inbox, Loader2, Search, SearchX, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { avatarTint, cn, initials } from '../lib/format';
import { FemaleAvatarIcon, MaleAvatarIcon } from './AvatarIcons';

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
};

const buttonVariants = {
  primary:
    'bg-brand text-white hover:bg-brand-ink shadow-sm disabled:bg-brand/50 dark:text-zinc-950',
  secondary:
    'bg-surface text-ink border border-line hover:bg-elevated hover:border-faint/40 shadow-sm',
  ghost: 'text-muted hover:bg-elevated hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm dark:text-zinc-950',
  success: 'bg-ok text-white hover:opacity-90 shadow-sm dark:text-zinc-950',
};

const buttonSizes = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9.5 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-9 w-9 justify-center',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', loading, children, ...props }, ref) => (
    <button
      ref={ref}
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg font-medium transition-all',
        'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[.98]',
        buttonVariants[variant],
        buttonSizes[size],
        size === 'md' && 'h-9',
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-card',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

const badgeTones = {
  neutral: 'bg-elevated text-muted border-line',
  brand: 'bg-brand-soft text-brand-ink border-brand/20',
  ok: 'bg-ok/10 text-ok border-ok/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  info: 'bg-info/10 text-info border-info/20',
};

export type BadgeTone = keyof typeof badgeTones;

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5',
        badgeTones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Maps every workflow state in the app to a consistent colour. */
const STATE_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  PENDING: 'warn',
  REJECTED: 'danger',
  SUBMITTED: 'info',
  COMPUTED: 'info',
  VALIDATED: 'brand',
  APPROVED: 'ok',
  PAID: 'ok',
  RUNNING: 'ok',
  PRESENT: 'ok',
  ACTIVE: 'ok',
  REFUSED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  ABSENT: 'danger',
  LATE: 'warn',
  OVERTIME: 'info',
  MISSING_CHECKOUT: 'warn',
};

export function StateBadge({ state }: { state?: string | null }) {
  if (!state) return <span className="text-muted">—</span>;
  const label = state.replace(/_/g, ' ');
  return (
    <Badge tone={STATE_TONES[state] ?? 'neutral'} dot>
      {label.charAt(0) + label.slice(1).toLowerCase()}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

const fieldClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint ' +
  'transition-colors hover:border-faint/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ' +
  'disabled:cursor-not-allowed disabled:bg-elevated disabled:text-muted';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} {...props} className={cn(fieldClass, 'h-9', className)} />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} {...props} className={cn(fieldClass, 'h-9 pr-8', className)}>
    {children}
  </select>
));
Select.displayName = 'Select';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} {...props} className={cn(fieldClass, 'min-h-20 resize-y', className)} />
));
Textarea.displayName = 'Textarea';

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-baseline gap-1 text-xs font-medium text-muted">
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-danger">{error}</span>}
    </label>
  );
}

/** Read-only key/value pair used across every form view. */
export function ReadField({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{value ?? '—'}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';

/**
 * Default avatar art, chosen by gender. The icons themselves live in
 * `AvatarIcons.tsx` — see that file for provenance.
 */
function GenderGlyph({ gender }: { gender: Gender }) {
  if (gender === 'FEMALE') return <FemaleAvatarIcon className="h-full w-full" />;
  if (gender === 'MALE') return <MaleAvatarIcon className="h-full w-full" />;

  // OTHER / UNDISCLOSED: a neutral figure, never a gendered guess.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[58%] w-[58%]" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M12 13.5c3.3 0 6 2 6 4.5V21H6v-3c0-2.5 2.7-4.5 6-4.5Z" />
    </svg>
  );
}

export function Avatar({
  firstName,
  lastName,
  size = 'md',
  className,
  /** A photo takes precedence over everything else. */
  avatarUrl,
  /** Chooses the fallback silhouette when there is no photo. */
  gender,
}: {
  firstName?: string;
  lastName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  avatarUrl?: string | null;
  gender?: Gender | null;
}) {
  const sizes = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-12 w-12 text-sm',
    xl: 'h-16 w-16 text-lg',
  };
  const seed = `${firstName ?? ''}${lastName ?? ''}`;
  const shell = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
    sizes[size],
    className,
  );

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${firstName ?? ''} ${lastName ?? ''}`.trim() || 'Employee'}
        className={cn(shell, 'object-cover')}
      />
    );
  }

  // A stated gender gets its illustrated avatar. These are full-colour icons,
  // so they sit on a plain neutral disc rather than a tinted one.
  if (gender === 'MALE' || gender === 'FEMALE') {
    return (
      <span className={cn(shell, 'bg-elevated')}>
        <GenderGlyph gender={gender} />
      </span>
    );
  }

  // Otherwise initials, which identify the person better than a silhouette.
  const hasName = Boolean(seed.trim());
  return (
    <span className={cn(shell, avatarTint(seed || 'x'))}>
      {hasName ? initials(firstName, lastName) : <GenderGlyph gender="UNDISCLOSED" />}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Table — scrolls horizontally on small screens, never the page               */
/* -------------------------------------------------------------------------- */

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={cn(
        'border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'border-b border-line/60 px-4 py-2.5 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  onClick,
  className,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-elevated',
        active && 'bg-brand-soft/60',
        className,
      )}
    >
      {children}
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 rounded-xl bg-elevated p-3 text-faint">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-muted', className)} />;
}

export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-elevated"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function ErrorBlock({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div className="m-4 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div>
        <p className="font-medium text-danger">Request failed</p>
        <p className="mt-0.5 text-xs text-muted">{message}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal — full-screen sheet on mobile, centred dialog on desktop              */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

  // Portalled to <body>: the app header sets `backdrop-blur`, which creates a
  // containing block that would otherwise trap this fixed overlay inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-pop animate-fade-up',
          'sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="scroll-x border-b border-line">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors',
              value === tab.value ? 'text-brand' : 'text-muted hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 rounded-full bg-elevated px-1.5 py-0.5 text-[10px] tabular text-muted">
                {tab.count}
              </span>
            )}
            {value === tab.value && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkbox                                                                    */
/* -------------------------------------------------------------------------- */

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  indeterminate?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2">
      <span
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border transition-colors',
          checked || indeterminate
            ? 'border-brand bg-brand text-white dark:text-zinc-950'
            : 'border-line bg-surface hover:border-faint',
        )}
      >
        {indeterminate ? (
          <span className="h-0.5 w-2 rounded-full bg-current" />
        ) : checked ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : null}
      </span>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Page header                                                                 */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumb,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-xs text-muted">{breadcrumb}</div>}
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Search input — the standard filter control on every list page               */
/* -------------------------------------------------------------------------- */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  autoFocus,
  count,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Result count shown once a query is typed. */
  count?: number;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      <Input
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        className={cn('pl-9', value && 'pr-16')}
      />
      {value && (
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {count !== undefined && (
            <span className="tabular text-[11px] text-faint">{count}</span>
          )}
          <button
            type="button"
            onClick={() => {
              onChange('');
              ref.current?.focus();
            }}
            aria-label="Clear search"
            className="rounded-md p-1 text-faint transition-colors hover:bg-elevated hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Shown in place of a table body when a search filters everything out. */
export function NoResults({
  query,
  onClear,
  noun = 'results',
}: {
  query: string;
  onClear: () => void;
  noun?: string;
}) {
  return (
    <EmptyState
      icon={SearchX}
      title={`No ${noun} match “${query}”`}
      description="Check the spelling, or try a shorter search term."
      action={<Button onClick={onClear}>Clear search</Button>}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* NumberInput — digits only, no stray characters                              */
/* -------------------------------------------------------------------------- */

/**
 * A numeric field that genuinely refuses non-numeric input.
 *
 * `<input type="number">` alone is not enough: browsers still accept `e`, `+`,
 * `-` and `.` keystrokes, and a pasted "abc" silently yields an empty value with
 * no feedback. This keeps the value as a string the caller controls, filters at
 * the source, and blocks the scroll-wheel gesture that otherwise changes numbers
 * when a user simply scrolls the page.
 */
export const NumberInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
    value: string | number;
    onChange: (value: string) => void;
    /** Allow a decimal point. Off by default — most money fields here are whole. */
    decimal?: boolean;
    /** Allow a leading minus. Off by default. */
    allowNegative?: boolean;
  }
>(({ className, value, onChange, decimal, allowNegative, ...props }, ref) => {
  const clean = (raw: string) => {
    let out = raw.replace(decimal ? /[^\d.]/g : /\D/g, '');
    if (decimal) {
      // Keep only the first decimal point.
      const [head, ...rest] = out.split('.');
      out = rest.length ? `${head}.${rest.join('')}` : head;
    }
    if (allowNegative && raw.trimStart().startsWith('-')) out = `-${out}`;
    return out;
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={String(value ?? '')}
      onChange={(e) => onChange(clean(e.target.value))}
      onKeyDown={(e) => {
        // Let navigation and shortcuts through; block character keys.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const ok =
            /\d/.test(e.key) ||
            (decimal && e.key === '.') ||
            (allowNegative && e.key === '-');
          if (!ok) e.preventDefault();
        }
      }}
      onWheel={(e) => e.currentTarget.blur()}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text');
        if (clean(text) !== text) {
          e.preventDefault();
          onChange(clean(text));
        }
      }}
      className={cn(fieldClass, 'h-9 tabular', className)}
    />
  );
});
NumberInput.displayName = 'NumberInput';

/* -------------------------------------------------------------------------- */
/* PhoneInput — digits, spaces and the usual dialling punctuation only         */
/* -------------------------------------------------------------------------- */

/**
 * A phone field. Letters are refused outright; `+`, spaces, hyphens and
 * parentheses are kept because real numbers are written with them
 * (`+91 98765 43210`, `(020) 7946-0958`).
 */
export const PhoneInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
    value: string;
    onChange: (value: string) => void;
  }
>(({ className, value, onChange, ...props }, ref) => {
  // A leading + is valid; anywhere else it is not.
  const clean = (raw: string) => {
    const plus = raw.trimStart().startsWith('+');
    const rest = raw.replace(/[^\d\s()-]/g, '');
    return (plus ? '+' : '') + rest;
  };

  return (
    <input
      {...props}
      ref={ref}
      type="tel"
      inputMode="tel"
      value={value ?? ''}
      onChange={(e) => onChange(clean(e.target.value))}
      onKeyDown={(e) => {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const atStart = e.currentTarget.selectionStart === 0;
          const ok = /[\d\s()-]/.test(e.key) || (e.key === '+' && atStart);
          if (!ok) e.preventDefault();
        }
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text');
        if (clean(text) !== text) {
          e.preventDefault();
          onChange(clean(text));
        }
      }}
      className={cn(fieldClass, 'h-9 tabular', className)}
    />
  );
});
PhoneInput.displayName = 'PhoneInput';

/* -------------------------------------------------------------------------- */
/* TextInput — letters only, for names and other word-shaped fields            */
/* -------------------------------------------------------------------------- */

/**
 * A field that refuses digits. Apostrophes, hyphens, full stops and spaces stay
 * allowed, because real names contain them (`O'Neill`, `Jean-Luc`, `St. John`).
 * Accented and non-Latin letters are preserved — never assume names are ASCII.
 */
export const TextInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: string;
    onChange: (value: string) => void;
  }
>(({ className, value, onChange, onKeyDown, ...props }, ref) => {
  const clean = (raw: string) => raw.replace(/[0-9]/g, '');

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(clean(e.target.value))}
      onKeyDown={(e) => {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && /[0-9]/.test(e.key)) {
          e.preventDefault();
        }
        // Run the caller's handler too — it would otherwise be shadowed.
        onKeyDown?.(e);
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text');
        if (clean(text) !== text) {
          e.preventDefault();
          onChange(clean(text));
        }
      }}
      className={cn(fieldClass, 'h-9', className)}
    />
  );
});
TextInput.displayName = 'TextInput';
