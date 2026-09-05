import { RuleCategory } from '@prisma/client';
import { evaluateCondition, evaluateFormula, FormulaScope } from './formula-sandbox';
import { ComputationResult, ComputedLine, EngineInput, EngineRule } from './types';

/**
 * THE ENGINE (invariant I2).
 *
 * Rules execute in ascending `sequence`. Each result is written into two
 * dictionaries that later rules can read — which is exactly what lets GROSS and
 * NET be *configured* rather than hardcoded:
 *
 *   rules['BASIC']          -> 50000
 *   categories['ALLOWANCE'] -> 30000   (running subtotal)
 *
 * This function is pure: same input, same output, no DB, no clock. That is what
 * makes it unit-testable and safely re-runnable on every Compute.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Resolve what a PERCENTAGE rule is a percentage *of*. */
function resolveBase(
  base: string | null,
  wage: number,
  rules: Record<string, number>,
  categories: Record<string, number>,
): number {
  switch (base) {
    case 'CONTRACT_WAGE':
      return wage;
    case 'BASIC':
      return rules['BASIC'] ?? categories[RuleCategory.BASIC] ?? 0;
    case 'GROSS':
      return rules['GROSS'] ?? categories[RuleCategory.GROSS] ?? 0;
    case 'CATEGORY_BASIC':
      return categories[RuleCategory.BASIC] ?? 0;
    case 'CATEGORY_ALLOWANCE':
      return categories[RuleCategory.ALLOWANCE] ?? 0;
    case 'CATEGORY_DEDUCTION':
      return categories[RuleCategory.DEDUCTION] ?? 0;
    default:
      // No explicit base configured — fall back to the contract wage.
      return wage;
  }
}

export function evaluateRules(input: EngineInput): ComputationResult {
  const { contract, periodStart, periodEnd } = input;

  const rules: Record<string, number> = {};
  const categories: Record<string, number> = {
    [RuleCategory.BASIC]: 0,
    [RuleCategory.ALLOWANCE]: 0,
    [RuleCategory.GROSS]: 0,
    [RuleCategory.DEDUCTION]: 0,
    [RuleCategory.NET]: 0,
  };
  const lines: ComputedLine[] = [];

  const ordered: EngineRule[] = [...input.rules]
    .filter((rule) => rule.isActive)
    .sort((a, b) => a.sequence - b.sequence || a.code.localeCompare(b.code));

  const scope = (): FormulaScope => ({
    rules,
    categories,
    wage: contract.wage,
    worked_days: input.workedDays,
    worked_hours: input.workedHours,
    expected_days: input.expectedDays || 1,
    expected_hours: input.expectedHours || 1,
    leave_days: input.leaveDays,
    unpaid_leave_days: input.unpaidLeaveDays,
    overtime_hours: input.overtimeHours,
    overtime_amount: input.overtimeAmount,
  });

  for (const rule of ordered) {
    if (!evaluateCondition(rule.condition, scope())) continue;

    let rate = 0;
    switch (rule.computationType) {
      case 'FIXED':
        rate = Number(rule.amountFixed ?? 0);
        break;
      case 'PERCENTAGE': {
        const base = resolveBase(rule.percentageBase, contract.wage, rules, categories);
        rate = (Number(rule.percentage ?? 0) / 100) * base;
        break;
      }
      case 'FORMULA':
        rate = evaluateFormula(rule.formula ?? '0', scope());
        break;
    }

    let amount = round2(rate * Number(rule.quantity ?? 1));

    // Deductions are always stored negative, whatever sign the rule produced.
    if (rule.category === RuleCategory.DEDUCTION) {
      amount = -Math.abs(amount);
    }

    lines.push({
      ruleId: rule.id,
      code: rule.code,
      name: rule.name,
      category: rule.category,
      sequence: rule.sequence,
      quantity: Number(rule.quantity ?? 1),
      rate: round2(rate),
      amount,
    });

    rules[rule.code] = amount;
    categories[rule.category] = round2((categories[rule.category] ?? 0) + amount);
  }

  // A structure is free to define its own GROSS / NET rules. When it does we
  // trust them; when it does not we derive sensible totals.
  const gross =
    rules['GROSS'] ??
    round2(categories[RuleCategory.BASIC] + categories[RuleCategory.ALLOWANCE]);
  const net = rules['NET'] ?? round2(gross + categories[RuleCategory.DEDUCTION]);

  void periodStart;
  void periodEnd;

  return { lines, rules, categories, gross: round2(gross), net: round2(net) };
}
