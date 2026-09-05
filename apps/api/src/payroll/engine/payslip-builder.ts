import { Injectable } from '@nestjs/common';
import { AttendanceStatus, Payslip, PayslipState, TimeOffState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractResolver } from './contract-resolver';
import { evaluateRules } from './rule-evaluator';
import { EngineInput, EngineRule, PayrollWarning } from './types';
import { WarningCollector } from './warning-collector';
import { countWorkingDays, scheduleHoursPerWeek } from '../../schedules/schedule.util';

export interface BuildResult {
  payslip: Payslip;
  warnings: PayrollWarning[];
}

/**
 * Turns (employee, period, structure) into a persisted Payslip + PayslipLines.
 * Re-running is safe: existing lines are replaced inside a transaction.
 */
@Injectable()
export class PayslipBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractResolver: ContractResolver,
    private readonly warningCollector: WarningCollector,
  ) {}

  async build(params: {
    employeeId: string;
    payrunId: string | null;
    salaryStructureId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<BuildResult> {
    const { employeeId, payrunId, salaryStructureId, periodStart, periodEnd } = params;

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: { workingSchedule: { include: { lines: true } } },
    });

    const { contract, warnings: contractWarnings } = await this.contractResolver.resolve(
      employeeId,
      periodStart,
      periodEnd,
    );

    // A contract's own structure wins over the payrun default when present.
    const structureId = contract?.salaryStructureId ?? salaryStructureId;
    const structure = await this.prisma.salaryStructure.findUniqueOrThrow({
      where: { id: structureId },
      include: { rules: { orderBy: { sequence: 'asc' } } },
    });

    const timeData = await this.collectTimeData(employeeId, periodStart, periodEnd);

    const schedule =
      employee.workingSchedule ??
      (contract?.workingScheduleId
        ? await this.prisma.workingSchedule.findUnique({
            where: { id: contract.workingScheduleId },
            include: { lines: true },
          })
        : null);

    const expectedDays = schedule
      ? countWorkingDays(schedule.lines, periodStart, periodEnd)
      : 22;
    const expectedHours = schedule
      ? (scheduleHoursPerWeek(schedule.lines) / 7) *
        ((periodEnd.getTime() - periodStart.getTime()) / 86_400_000 + 1)
      : expectedDays * 8;

    const input: EngineInput = {
      contract: {
        id: contract?.id ?? '',
        reference: contract?.reference ?? '',
        wage: Number(contract?.wage ?? 0),
        startDate: contract?.startDate ?? periodStart,
        endDate: contract?.endDate ?? null,
      },
      rules: structure.rules.map<EngineRule>((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        sequence: r.sequence,
        category: r.category,
        computationType: r.computationType as EngineRule['computationType'],
        amountFixed: r.amountFixed === null ? null : Number(r.amountFixed),
        percentage: r.percentage === null ? null : Number(r.percentage),
        percentageBase: r.percentageBase,
        formula: r.formula,
        condition: r.condition,
        quantity: Number(r.quantity),
        isActive: r.isActive,
      })),
      periodStart,
      periodEnd,
      workedDays: timeData.workedDays,
      workedHours: timeData.workedHours,
      expectedDays,
      expectedHours: Math.round(expectedHours),
      leaveDays: timeData.leaveDays,
      unpaidLeaveDays: timeData.unpaidLeaveDays,
      overtimeHours: timeData.overtimeHours,
      overtimeAmount: timeData.overtimeAmount,
    };

    // No contract → no numbers. Persist an empty payslip carrying the warning
    // so the payrun screen can show the problem instead of hiding the employee.
    const computation = contract
      ? evaluateRules(input)
      : { lines: [], rules: {}, categories: {}, gross: 0, net: 0 };

    const existing = payrunId
      ? await this.prisma.payslip.findUnique({
          where: { payrunId_employeeId: { payrunId, employeeId } },
        })
      : null;

    const warnings = [
      ...contractWarnings,
      ...(await this.warningCollector.collect({
        employee,
        contract,
        periodStart,
        periodEnd,
        payslipId: existing?.id,
        net: computation.net,
      })),
    ];

    const payslip = await this.prisma.$transaction(async (tx) => {
      const data = {
        employeeId,
        contractId: contract?.id ?? null,
        salaryStructureId: structureId,
        periodStart,
        periodEnd,
        state: PayslipState.COMPUTED,
        workedDays: timeData.workedDays,
        workedHours: timeData.workedHours,
        leaveDays: timeData.leaveDays,
        grossAmount: computation.gross,
        netAmount: computation.net,
        warnings: warnings as unknown as object,
      };

      const saved = existing
        ? await tx.payslip.update({ where: { id: existing.id }, data })
        : await tx.payslip.create({
            data: {
              ...data,
              payrunId,
              number: await this.nextPayslipNumber(tx, periodStart),
            },
          });

      await tx.payslipLine.deleteMany({ where: { payslipId: saved.id } });
      if (computation.lines.length) {
        await tx.payslipLine.createMany({
          data: computation.lines.map((line) => ({
            payslipId: saved.id,
            ruleId: line.ruleId || null,
            code: line.code,
            name: line.name,
            category: line.category,
            sequence: line.sequence,
            quantity: line.quantity,
            rate: line.rate,
            amount: line.amount,
          })),
        });
      }

      return saved;
    });

    return { payslip, warnings };
  }

  /** Aggregates attendance + approved leave for the period. */
  private async collectTimeData(employeeId: string, from: Date, to: Date) {
    const [attendances, requests] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { employeeId, date: { gte: from, lte: to } },
      }),
      this.prisma.timeOffRequest.findMany({
        where: {
          employeeId,
          state: TimeOffState.APPROVED,
          dateFrom: { lte: to },
          dateTo: { gte: from },
        },
        include: { type: true },
      }),
    ]);

    const workedHours = attendances.reduce((sum, a) => sum + Number(a.workedHours), 0);
    const workedDays = attendances.filter(
      (a) => a.status !== AttendanceStatus.ABSENT && Number(a.workedHours) > 0,
    ).length;
    // Only overtime HR actually approved is paid. An OVERTIME status alone is
    // just a clock reading — without an approved request it earns nothing.
    const approvedRequests = await this.prisma.attendanceRequest.findMany({
      where: {
        employeeId,
        date: { gte: from, lte: to },
        type: 'EXTRA_TIME',
        state: 'APPROVED',
      },
      select: { deltaHours: true, approvedAmount: true },
    });
    const overtimeHours = approvedRequests.reduce(
      (sum, r) => sum + Math.max(0, Number(r.deltaHours)),
      0,
    );
    const overtimeAmount = approvedRequests.reduce(
      (sum, r) => sum + Number(r.approvedAmount ?? 0),
      0,
    );

    const leaveDays = requests.reduce((sum, r) => sum + Number(r.duration), 0);
    const unpaidLeaveDays = requests
      .filter((r) => !r.type.isPaid)
      .reduce((sum, r) => sum + Number(r.duration), 0);

    return {
      workedDays,
      workedHours: Math.round(workedHours * 100) / 100,
      leaveDays,
      unpaidLeaveDays,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      overtimeAmount: Math.round(overtimeAmount * 100) / 100,
    };
  }

  private async nextPayslipNumber(tx: any, periodStart: Date): Promise<string> {
    const prefix = `SLIP/${periodStart.getFullYear()}/${String(
      periodStart.getMonth() + 1,
    ).padStart(2, '0')}`;
    const count = await tx.payslip.count({ where: { number: { startsWith: prefix } } });
    return `${prefix}/${String(count + 1).padStart(4, '0')}`;
  }
}
