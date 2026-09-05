import { Parser } from 'expr-eval';

/**
 * Sandboxed expression evaluation for FORMULA salary rules.
 *
 * We never call eval(). `expr-eval` parses a restricted arithmetic grammar with
 * no property access on host objects, no function declarations and no I/O.
 * The rule author writes an expression that produces the amount, optionally
 * prefixed with `result =` (the convention shown in the mockup):
 *
 *   result = categories['BASIC'] + categories['ALLOWANCE']
 *   result = -(rules['BASIC'] / expected_days) * unpaid_leave_days
 */

const parser = new Parser({
  operators: {
    add: true,
    subtract: true,
    multiply: true,
    divide: true,
    remainder: true,
    power: true,
    concatenate: false,
    conditional: true,
    logical: true,
    comparison: true,
    in: false,
    assignment: false,
  },
});

/** Values a formula may reference. Everything else is out of scope. */
export interface FormulaScope {
  rules: Record<string, number>;
  categories: Record<string, number>;
  wage: number;
  worked_days: number;
  worked_hours: number;
  expected_days: number;
  expected_hours: number;
  leave_days: number;
  unpaid_leave_days: number;
  overtime_hours: number;
}

/**
 * `expr-eval` cannot index objects with a string literal (`rules['BASIC']`),
 * so we flatten the dictionaries into plain identifiers before parsing:
 *   rules['BASIC']       -> rules_BASIC
 *   categories['GROSS']  -> categories_GROSS
 *   contract.wage        -> wage
 */
function normalise(expression: string): string {
  return expression
    .replace(/^\s*result\s*=\s*/i, '')
    .replace(/\brules\s*\[\s*['"]([A-Za-z0-9_]+)['"]\s*\]/g, 'rules_$1')
    .replace(/\bcategories\s*\[\s*['"]([A-Za-z0-9_]+)['"]\s*\]/g, 'categories_$1')
    .replace(/\bcontract\.wage\b/g, 'wage')
    .replace(/\bpayslip\./g, '')
    .trim();
}

function flatten(scope: FormulaScope): Record<string, number> {
  const flat: Record<string, number> = {
    wage: scope.wage,
    worked_days: scope.worked_days,
    worked_hours: scope.worked_hours,
    expected_days: scope.expected_days,
    expected_hours: scope.expected_hours,
    leave_days: scope.leave_days,
    unpaid_leave_days: scope.unpaid_leave_days,
    overtime_hours: scope.overtime_hours,
  };
  for (const [code, value] of Object.entries(scope.rules)) {
    flat[`rules_${code}`] = value;
  }
  for (const [category, value] of Object.entries(scope.categories)) {
    flat[`categories_${category}`] = value;
  }
  return flat;
}

export class FormulaError extends Error {
  constructor(expression: string, cause: unknown) {
    super(
      `Invalid salary rule formula "${expression}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'FormulaError';
  }
}

/** Evaluate a FORMULA rule. Unknown identifiers resolve to 0, not a crash. */
export function evaluateFormula(expression: string, scope: FormulaScope): number {
  const normalised = normalise(expression);
  if (!normalised) return 0;

  const flat = flatten(scope);
  try {
    const expr = parser.parse(normalised);
    // Any identifier the rule references but the scope does not define is 0 —
    // a rule referencing a not-yet-computed code must not blow up the payrun.
    for (const symbol of expr.variables()) {
      if (!(symbol in flat)) flat[symbol] = 0;
    }
    const value = expr.evaluate(flat);
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch (error) {
    throw new FormulaError(expression, error);
  }
}

/** Evaluate a rule's optional `condition` guard. Empty condition = always run. */
export function evaluateCondition(expression: string | null, scope: FormulaScope): boolean {
  if (!expression || !expression.trim()) return true;
  const normalised = normalise(expression);
  const flat = flatten(scope);
  try {
    const expr = parser.parse(normalised);
    for (const symbol of expr.variables()) {
      if (!(symbol in flat)) flat[symbol] = 0;
    }
    return Boolean(expr.evaluate(flat));
  } catch {
    // A broken condition should not silently skip the rule.
    return true;
  }
}
