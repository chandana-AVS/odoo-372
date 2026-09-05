import { describe, expect, it } from 'vitest';
import { evaluateRules } from './rule-evaluator';
import { EngineInput, EngineRule } from './types';

/**
 * The proof that invariant I2 holds: changing a rule changes the payslip, and
 * the seeded "Regular Salary" structure turns a wage of 100,000 into a net of
 * 75,000 purely through configuration.
 */

const rule = (over: Partial<EngineRule>): EngineRule => ({
  id: over.code ?? 'x',
  name: over.name ?? 'Rule',
  code: over.code ?? 'X',
  sequence: over.sequence ?? 10,
  category: over.category ?? ('BASIC' as any),
  computationType: over.computationType ?? 'FIXED',
  amountFixed: over.amountFixed ?? null,
  percentage: over.percentage ?? null,
  percentageBase: over.percentageBase ?? null,
  formula: over.formula ?? null,
  condition: over.condition ?? null,
  quantity: over.quantity ?? 1,
  isActive: over.isActive ?? true,
});

const regularSalary = (hraPercent = 40): EngineRule[] => [
  rule({
    code: 'BASIC',
    name: 'Basic Salary',
    sequence: 1,
    category: 'BASIC' as any,
    computationType: 'PERCENTAGE',
    percentage: 50,
    percentageBase: 'CONTRACT_WAGE',
  }),
  rule({
    code: 'HRA',
    name: 'House Rent Allowance',
    sequence: 10,
    category: 'ALLOWANCE' as any,
    computationType: 'PERCENTAGE',
    percentage: hraPercent,
    percentageBase: 'BASIC',
  }),
  rule({
    code: 'STD',
    name: 'Standard Allowance',
    sequence: 20,
    category: 'ALLOWANCE' as any,
    computationType: 'FIXED',
    amountFixed: 10000,
  }),
  rule({
    code: 'GROSS',
    name: 'Gross Salary',
    sequence: 30,
    category: 'GROSS' as any,
    computationType: 'FORMULA',
    formula: "result = categories['BASIC'] + categories['ALLOWANCE']",
  }),
  rule({
    code: 'PF',
    name: 'Provident Fund',
    sequence: 40,
    category: 'DEDUCTION' as any,
    computationType: 'PERCENTAGE',
    percentage: 6,
    percentageBase: 'BASIC',
  }),
  rule({
    code: 'PT',
    name: 'Professional Tax',
    sequence: 45,
    category: 'DEDUCTION' as any,
    computationType: 'FIXED',
    amountFixed: 2000,
  }),
  rule({
    code: 'NET',
    name: 'Net Salary',
    sequence: 50,
    category: 'NET' as any,
    computationType: 'FORMULA',
    formula: "result = rules['GROSS'] + categories['DEDUCTION']",
  }),
];

const input = (rules: EngineRule[], wage = 100000): EngineInput => ({
  contract: {
    id: 'c1',
    reference: 'CON/2026/0042',
    wage,
    startDate: new Date('2026-01-01'),
    endDate: null,
  },
  rules,
  periodStart: new Date('2026-02-01'),
  periodEnd: new Date('2026-02-28'),
  workedDays: 22,
  workedHours: 176,
  expectedDays: 22,
  expectedHours: 176,
  leaveDays: 0,
  unpaidLeaveDays: 0,
  overtimeHours: 0,
  overtimeAmount: 0,
});

describe('rule evaluator', () => {
  it('computes the seeded Regular Salary structure end to end', () => {
    const result = evaluateRules(input(regularSalary()));

    expect(result.rules.BASIC).toBe(50000);
    expect(result.rules.HRA).toBe(20000);
    expect(result.rules.STD).toBe(10000);
    expect(result.rules.GROSS).toBe(80000);
    expect(result.rules.PF).toBe(-3000);
    expect(result.rules.PT).toBe(-2000);
    expect(result.net).toBe(75000);
  });

  it('stores deductions as negative amounts', () => {
    const result = evaluateRules(input(regularSalary()));
    const pf = result.lines.find((l) => l.code === 'PF');
    expect(pf?.amount).toBeLessThan(0);
  });

  it('respects sequence — GROSS sees allowances computed before it', () => {
    const shuffled = [...regularSalary()].reverse();
    const result = evaluateRules(input(shuffled));
    expect(result.rules.GROSS).toBe(80000);
  });

  it('I2: editing a rule changes the payslip', () => {
    const at40 = evaluateRules(input(regularSalary(40)));
    const at45 = evaluateRules(input(regularSalary(45)));

    expect(at40.rules.HRA).toBe(20000);
    expect(at45.rules.HRA).toBe(22500);
    expect(at45.net).toBe(at40.net + 2500);
  });

  it('skips inactive rules', () => {
    const rules = regularSalary().map((r) =>
      r.code === 'STD' ? { ...r, isActive: false } : r,
    );
    const result = evaluateRules(input(rules));
    expect(result.rules.STD).toBeUndefined();
    expect(result.rules.GROSS).toBe(70000);
  });

  it('honours a rule condition', () => {
    const rules = [
      ...regularSalary(),
      rule({
        code: 'BONUS',
        name: 'Attendance Bonus',
        sequence: 25,
        category: 'ALLOWANCE' as any,
        computationType: 'FIXED',
        amountFixed: 5000,
        condition: 'worked_days >= 30',
      }),
    ];
    const result = evaluateRules(input(rules));
    expect(result.rules.BONUS).toBeUndefined();
  });

  it('supports attendance-prorated formulas', () => {
    const rules = [
      rule({
        code: 'BASIC',
        name: 'Prorated Basic',
        sequence: 1,
        category: 'BASIC' as any,
        computationType: 'FORMULA',
        formula: 'result = wage * 0.5 * (worked_days / expected_days)',
      }),
    ];
    const partial = { ...input(rules), workedDays: 11, expectedDays: 22 };
    const result = evaluateRules(partial);
    expect(result.rules.BASIC).toBe(25000);
  });

  it('treats an unknown identifier as zero rather than crashing', () => {
    const rules = [
      rule({
        code: 'WEIRD',
        name: 'References a missing code',
        sequence: 1,
        category: 'ALLOWANCE' as any,
        computationType: 'FORMULA',
        formula: "result = rules['DOES_NOT_EXIST'] + 100",
      }),
    ];
    expect(evaluateRules(input(rules)).rules.WEIRD).toBe(100);
  });
});
