import { AlertTriangle, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../../components/ui';
import { cn } from '../../lib/format';

export interface PreflightRow {
  employeeId: string;
  code: string;
  name: string;
  hasBankAccount: boolean;
  hasWorkEmail: boolean;
  hasSalaryStructure: boolean;
  duplicatePayslip: string | null;
  duplicateOf: string | null;
}

type Severity = 'blocking' | 'warning';

interface Issue {
  code: string;
  severity: Severity;
  label: string;
  hint: string;
  rows: PreflightRow[];
}

/**
 * Data problems that would spoil a payrun, found BEFORE computing rather than
 * after. Blocking issues would corrupt payroll (paying twice, or with no rules
 * to compute); warnings still let the run proceed.
 */
function collectIssues(rows: PreflightRow[]): Issue[] {
  type Rule = Omit<Issue, 'rows'> & { match: (row: PreflightRow) => boolean };
  const rules: Rule[] = [
    {
      code: 'DUPLICATE_PAYSLIP',
      severity: 'blocking',
      label: 'Already has a payslip for this period',
      hint: 'Computing again would pay these people twice for the same period.',
      match: (row) => Boolean(row.duplicatePayslip),
    },
    {
      code: 'DUPLICATE_EMPLOYEE',
      severity: 'blocking',
      label: 'Possible duplicate employee record',
      hint: 'Two records for the same person — merge or archive one before paying.',
      match: (row) => Boolean(row.duplicateOf),
    },
    {
      code: 'NO_SALARY_STRUCTURE',
      severity: 'blocking',
      label: 'No salary structure on the contract',
      hint: 'Payroll has no rules to run, so nothing can be computed.',
      match: (row) => !row.hasSalaryStructure,
    },
    {
      code: 'MISSING_BANK_ACCOUNT',
      severity: 'warning',
      label: 'No bank account on file',
      hint: 'The payslip computes, but the salary cannot be transferred.',
      match: (row) => !row.hasBankAccount,
    },
    {
      code: 'MISSING_WORK_EMAIL',
      severity: 'warning',
      label: 'No work email on file',
      hint: 'The payslip cannot be emailed to them.',
      match: (row) => !row.hasWorkEmail,
    },
  ];

  return rules
    .map(({ match, ...rest }) => ({ ...rest, rows: rows.filter(match) }))
    .filter((issue) => issue.rows.length > 0);
}

/** Detail line explaining what a given row clashes with. */
function detailFor(issue: Issue, row: PreflightRow): string | null {
  if (issue.code === 'DUPLICATE_PAYSLIP') return row.duplicatePayslip;
  if (issue.code === 'DUPLICATE_EMPLOYEE') return row.duplicateOf;
  return null;
}

export function PreflightPanel({ rows }: { rows: PreflightRow[] }) {
  const issues = React.useMemo(() => collectIssues(rows), [rows]);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const blocking = issues.filter((i) => i.severity === 'blocking');
  const warnings = issues.filter((i) => i.severity === 'warning');

  if (rows.length === 0) return null;

  // Clean bill of health — worth stating, so silence is never ambiguous.
  if (issues.length === 0) {
    return (
      <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-ok/25 bg-ok/5 px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
        <span>
          No data problems found across {rows.length} employee
          {rows.length === 1 ? '' : 's'} — ready to compute.
        </span>
      </div>
    );
  }

  const tone = blocking.length ? 'danger' : 'warn';

  return (
    <Card
      className={cn(
        'mb-4 overflow-hidden',
        blocking.length ? 'border-danger/30' : 'border-warn/30',
      )}
    >
      <div
        className={cn(
          'flex items-start gap-3 px-4 py-3',
          blocking.length ? 'bg-danger/5' : 'bg-warn/5',
        )}
      >
        <AlertTriangle
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            blocking.length ? 'text-danger' : 'text-warn',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {issues.reduce((sum, i) => sum + i.rows.length, 0)} issue
            {issues.reduce((sum, i) => sum + i.rows.length, 0) === 1 ? '' : 's'} found
            before computing
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {blocking.length > 0
              ? 'Blocking issues must be fixed — payroll cannot be validated while they stand.'
              : 'These will not stop the payrun, but are worth fixing first.'}
          </p>
        </div>
        <Badge tone={tone}>
          {blocking.length > 0 ? `${blocking.length} blocking` : `${warnings.length} warning`}
        </Badge>
      </div>

      <ul className="divide-y divide-line">
        {issues.map((issue) => {
          const open = expanded === issue.code;
          return (
            <li key={issue.code}>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : issue.code)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-elevated"
              >
                {issue.severity === 'blocking' ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" />
                ) : (
                  <Info className="h-3.5 w-3.5 shrink-0 text-warn" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{issue.label}</span>
                  <span className="block truncate text-[11px] text-muted">{issue.hint}</span>
                </span>
                <Badge tone={issue.severity === 'blocking' ? 'danger' : 'warn'}>
                  {issue.rows.length}
                </Badge>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-faint transition-transform',
                    open && 'rotate-180',
                  )}
                />
              </button>

              {open && (
                <ul className="border-t border-line bg-elevated/40 px-4 py-2">
                  {issue.rows.slice(0, 25).map((row) => {
                    const detail = detailFor(issue, row);
                    return (
                      <li
                        key={row.employeeId}
                        className="flex items-center justify-between gap-3 py-1.5 text-xs"
                      >
                        <span className="min-w-0">
                          <Link
                            to={`/employees/${row.employeeId}`}
                            className="font-medium hover:text-brand hover:underline"
                          >
                            {row.name}
                          </Link>
                          <span className="ml-1.5 tabular text-faint">{row.code}</span>
                          {detail && (
                            <span className="ml-1.5 text-muted">— {detail}</span>
                          )}
                        </span>
                        <Link
                          to={`/employees/${row.employeeId}`}
                          className="shrink-0 text-brand hover:underline"
                        >
                          Fix
                        </Link>
                      </li>
                    );
                  })}
                  {issue.rows.length > 25 && (
                    <li className="py-1.5 text-[11px] text-faint">
                      …and {issue.rows.length - 25} more.
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** True when any selected employee carries a blocking issue. */
export function hasBlockingIssues(rows: PreflightRow[]): boolean {
  return collectIssues(rows).some((i) => i.severity === 'blocking');
}
