import { Injectable } from '@nestjs/common';
import { Contract, Employee } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollWarning } from './types';

/**
 * "Surface potential payroll issues to users before finalization."
 *
 * Warnings are computed on every Compute and stored on the payslip. Validate
 * refuses while any `blocking` warning is outstanding.
 */
@Injectable()
export class WarningCollector {
  constructor(private readonly prisma: PrismaService) {}

  async collect(params: {
    employee: Employee;
    contract: Contract | null;
    periodStart: Date;
    periodEnd: Date;
    payslipId?: string;
    net: number;
  }): Promise<PayrollWarning[]> {
    const { employee, contract, periodStart, periodEnd, payslipId, net } = params;
    const warnings: PayrollWarning[] = [];
    const at = (code: string, severity: PayrollWarning['severity'], message: string) =>
      warnings.push({ code, severity, message, employeeId: employee.id });

    if (!employee.bankAccount || !employee.bankAccount.trim()) {
      at(
        'MISSING_BANK_ACCOUNT',
        'warning',
        `${employee.firstName} ${employee.lastName} has no bank account on file.`,
      );
    }

    if (!employee.workEmail || !employee.workEmail.trim()) {
      at(
        'MISSING_WORK_EMAIL',
        'warning',
        `${employee.firstName} ${employee.lastName} has no work email — payslip cannot be sent.`,
      );
    }

    if (contract && !contract.salaryStructureId) {
      at(
        'NO_SALARY_STRUCTURE',
        'blocking',
        `Contract ${contract.reference} has no salary structure assigned.`,
      );
    }

    if (contract?.endDate && contract.endDate >= periodStart && contract.endDate <= periodEnd) {
      at(
        'CONTRACT_EXPIRING',
        'info',
        `Contract ${contract.reference} expires on ${contract.endDate
          .toISOString()
          .slice(0, 10)}.`,
      );
    }

    // Duplicate payslip for the same employee + period, in any other payrun.
    const duplicate = await this.prisma.payslip.findFirst({
      where: {
        employeeId: employee.id,
        periodStart,
        periodEnd,
        id: payslipId ? { not: payslipId } : undefined,
      },
      select: { id: true, number: true },
    });
    if (duplicate) {
      at(
        'DUPLICATE_PAYSLIP',
        'blocking',
        `Payslip ${duplicate.number} already covers this period for this employee.`,
      );
    }

    // Another active record that looks like the same person. Paying both is a
    // real risk, so this blocks rather than merely warns.
    const twin = await this.prisma.employee.findFirst({
      where: {
        id: { not: employee.id },
        isActive: true,
        OR: [
          {
            firstName: { equals: employee.firstName, mode: 'insensitive' },
            lastName: { equals: employee.lastName, mode: 'insensitive' },
          },
          ...(employee.bankAccount?.trim()
            ? [{ bankAccount: employee.bankAccount.trim() }]
            : []),
        ],
      },
      select: { code: true, firstName: true, lastName: true, bankAccount: true },
    });
    if (twin) {
      const sameBank =
        Boolean(employee.bankAccount?.trim()) &&
        twin.bankAccount?.trim() === employee.bankAccount?.trim();
      at(
        'DUPLICATE_EMPLOYEE',
        'blocking',
        `${employee.firstName} ${employee.lastName} may be a duplicate of ${twin.code} ` +
          `(${sameBank ? 'same bank account' : 'same name'}). Merge or archive one before paying.`,
      );
    }

    if (net < 0) {
      at('NEGATIVE_NET', 'blocking', `Computed net salary is negative (${net}).`);
    }

    return warnings;
  }

  static blocking(warnings: PayrollWarning[]): PayrollWarning[] {
    return warnings.filter((w) => w.severity === 'blocking');
  }
}
