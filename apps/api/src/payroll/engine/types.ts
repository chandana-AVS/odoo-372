import { RuleCategory } from '@prisma/client';

/** A rule as the evaluator needs it — decoupled from Prisma row shape. */
export interface EngineRule {
  id: string;
  name: string;
  code: string;
  sequence: number;
  category: RuleCategory;
  computationType: 'FIXED' | 'PERCENTAGE' | 'FORMULA';
  amountFixed: number | null;
  percentage: number | null;
  percentageBase: string | null;
  formula: string | null;
  condition: string | null;
  quantity: number;
  isActive: boolean;
}

export interface EngineContract {
  id: string;
  reference: string;
  wage: number;
  startDate: Date;
  endDate: Date | null;
}

/** Everything the engine is allowed to see. Pure input — no DB handle. */
export interface EngineInput {
  contract: EngineContract;
  rules: EngineRule[];
  periodStart: Date;
  periodEnd: Date;
  workedDays: number;
  workedHours: number;
  expectedDays: number;
  expectedHours: number;
  leaveDays: number;
  unpaidLeaveDays: number;
  overtimeHours: number;
}

export interface ComputedLine {
  ruleId: string;
  code: string;
  name: string;
  category: RuleCategory;
  sequence: number;
  quantity: number;
  rate: number;
  amount: number;
}

export interface ComputationResult {
  lines: ComputedLine[];
  /** code -> amount, e.g. rules['BASIC'] */
  rules: Record<string, number>;
  /** category -> running subtotal, e.g. categories['ALLOWANCE'] */
  categories: Record<string, number>;
  gross: number;
  net: number;
}

export type WarningSeverity = 'blocking' | 'warning' | 'info';

export interface PayrollWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
  employeeId?: string;
}
