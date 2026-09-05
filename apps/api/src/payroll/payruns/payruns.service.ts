import { BadRequestException, Injectable } from '@nestjs/common';
import { ContractStatus, PayrunState, PayslipState, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../shared/mail.service';
import { PdfService } from '../../shared/pdf.service';
import { PayslipBuilder } from '../engine/payslip-builder';
import { PayrollWarning } from '../engine/types';

export interface PayrunScope {
  salaryStructureId: string;
  periodStart: string;
  periodEnd: string;
  employeeType?: string;
  departmentId?: string;
  companyId?: string;
}

@Injectable()
export class PayrunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: PayslipBuilder,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
  ) {}

  /**
   * WIZARD STEP 2 — a pure READ. Returns who *would* be included.
   * Deliberately creates nothing: the mockup is explicit that "Continue only
   * moves to employee selection. A Payrun is created only after clicking
   * Create Payrun."
   */
  async eligibleEmployees(scope: PayrunScope) {
    const periodStart = new Date(scope.periodStart);
    const periodEnd = new Date(scope.periodEnd);

    const contracts = await this.prisma.contract.findMany({
      where: {
        status: ContractStatus.RUNNING,
        startDate: { lte: periodEnd },
        OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        employee: {
          isActive: true,
          employeeType: (scope.employeeType as any) || undefined,
          departmentId: scope.departmentId || undefined,
          companyId: scope.companyId || undefined,
        },
      },
      include: {
        employee: {
          include: {
            department: true,
            workingSchedule: { include: { lines: true } },
          },
        },
        salaryStructure: { select: { id: true, name: true } },
        workingSchedule: { include: { lines: true } },
      },
      orderBy: { employee: { firstName: 'asc' } },
    });

    // Flag anyone who already has a payslip for this exact period.
    const existing = await this.prisma.payslip.findMany({
      where: { periodStart, periodEnd },
      select: { employeeId: true, number: true },
    });
    const alreadyPaid = new Map(existing.map((p) => [p.employeeId, p.number]));

    // Two records for the same human is a genuine payroll risk — the person
    // gets paid twice. Match on name and on a shared bank account, since a
    // re-hire or a bad import usually collides on one or the other.
    const ids = contracts.map((c) => c.employee.id);
    const duplicateIds = await this.findDuplicateEmployeeIds(ids);

    return contracts.map((contract) => ({
      employeeId: contract.employee.id,
      code: contract.employee.code,
      name: `${contract.employee.firstName} ${contract.employee.lastName}`,
      avatarUrl: contract.employee.avatarUrl,
      department: contract.employee.department?.name ?? null,
      employeeType: contract.employee.employeeType,
      contractId: contract.id,
      contractReference: contract.reference,
      startDate: contract.startDate,
      wage: Number(contract.wage),
      workingSchedule: contract.workingSchedule?.name ?? contract.employee.workingSchedule?.name ?? null,
      payStructure: contract.salaryStructure?.name ?? null,
      hasBankAccount: Boolean(contract.employee.bankAccount),
      hasWorkEmail: Boolean(contract.employee.workEmail?.trim()),
      hasSalaryStructure: Boolean(contract.salaryStructureId),
      duplicatePayslip: alreadyPaid.get(contract.employee.id) ?? null,
      duplicateOf: duplicateIds.get(contract.employee.id) ?? null,
    }));
  }

  /**
   * Employees that look like the same person as somebody else. Returns a map of
   * employee id -> a human description of who they clash with.
   */
  private async findDuplicateEmployeeIds(
    ids: string[],
  ): Promise<Map<string, string>> {
    const clashes = new Map<string, string>();
    if (!ids.length) return clashes;

    const people = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        bankAccount: true,
      },
    });

    const byName = new Map<string, typeof people>();
    const byBank = new Map<string, typeof people>();
    for (const person of people) {
      const nameKey = `${person.firstName.trim().toLowerCase()} ${person.lastName
        .trim()
        .toLowerCase()}`;
      byName.set(nameKey, [...(byName.get(nameKey) ?? []), person]);

      const bank = person.bankAccount?.trim();
      if (bank) byBank.set(bank, [...(byBank.get(bank) ?? []), person]);
    }

    const wanted = new Set(ids);
    const note = (person: { id: string }, text: string) => {
      if (!wanted.has(person.id)) return;
      const existing = clashes.get(person.id);
      clashes.set(person.id, existing ? `${existing}; ${text}` : text);
    };

    for (const group of byName.values()) {
      if (group.length < 2) continue;
      for (const person of group) {
        const others = group.filter((p) => p.id !== person.id).map((p) => p.code);
        note(person, `same name as ${others.join(', ')}`);
      }
    }
    for (const group of byBank.values()) {
      if (group.length < 2) continue;
      for (const person of group) {
        const others = group.filter((p) => p.id !== person.id).map((p) => p.code);
        note(person, `same bank account as ${others.join(', ')}`);
      }
    }

    return clashes;
  }

  /** "Create Payrun" — the batch contains ONLY the selected employees. */
  async create(user: AuthUser, dto: PayrunScope & { employeeIds: string[]; name?: string }) {
    if (!dto.employeeIds?.length) {
      throw new BadRequestException('Select at least one employee.');
    }

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    const company =
      dto.companyId ?? (await this.prisma.company.findFirstOrThrow()).id;

    const payrun = await this.prisma.payrun.create({
      data: {
        name:
          dto.name ||
          periodStart.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        periodStart,
        periodEnd,
        salaryStructureId: dto.salaryStructureId,
        employeeType: (dto.employeeType as any) || null,
        departmentId: dto.departmentId || null,
        companyId: company,
        createdById: user.id,
        state: PayrunState.DRAFT,
        payslips: {
          create: await Promise.all(
            dto.employeeIds.map(async (employeeId, index) => ({
              employeeId,
              salaryStructureId: dto.salaryStructureId,
              periodStart,
              periodEnd,
              number: `SLIP/${periodStart.getFullYear()}/${String(
                periodStart.getMonth() + 1,
              ).padStart(2, '0')}/${String(Date.now() % 100000).padStart(5, '0')}${index}`,
            })),
          ),
        },
      },
      include: { payslips: true },
    });

    return this.findOne(payrun.id);
  }

  findAll(query: { state?: string; from?: string; to?: string }) {
    return this.prisma.payrun.findMany({
      where: {
        state: (query.state as PayrunState) || undefined,
        periodStart: query.from ? { gte: new Date(query.from) } : undefined,
        periodEnd: query.to ? { lte: new Date(query.to) } : undefined,
      },
      include: {
        salaryStructure: { select: { name: true } },
        department: { select: { name: true } },
        _count: { select: { payslips: true } },
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  async findOne(id: string) {
    const payrun = await this.prisma.payrun.findUniqueOrThrow({
      where: { id },
      include: {
        salaryStructure: true,
        department: true,
        createdBy: { select: { email: true } },
        payslips: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                code: true,
                avatarUrl: true,
                bankAccount: true,
              },
            },
            lines: { orderBy: { sequence: 'asc' } },
          },
          orderBy: { employee: { firstName: 'asc' } },
        },
      },
    });

    const warnings = payrun.payslips.flatMap(
      (p) => (p.warnings as unknown as PayrollWarning[]) ?? [],
    );

    return {
      ...payrun,
      totals: {
        gross: payrun.payslips.reduce((s, p) => s + Number(p.grossAmount), 0),
        net: payrun.payslips.reduce((s, p) => s + Number(p.netAmount), 0),
        count: payrun.payslips.length,
      },
      warnings,
      blockingWarnings: warnings.filter((w) => w.severity === 'blocking'),
    };
  }

  /** COMPUTE — (re)runs the engine for every payslip in the batch. */
  async compute(id: string) {
    const payrun = await this.prisma.payrun.findUniqueOrThrow({
      where: { id },
      include: { payslips: { select: { employeeId: true } } },
    });

    if (payrun.state === PayrunState.PAID) {
      throw new BadRequestException('A paid payrun is historical and cannot be recomputed.');
    }

    for (const { employeeId } of payrun.payslips) {
      await this.builder.build({
        employeeId,
        payrunId: payrun.id,
        salaryStructureId: payrun.salaryStructureId,
        periodStart: payrun.periodStart,
        periodEnd: payrun.periodEnd,
      });
    }

    await this.prisma.payrun.update({
      where: { id },
      data: { state: PayrunState.COMPUTED, computedAt: new Date() },
    });

    return this.findOne(id);
  }

  /** VALIDATE — refuses while any blocking warning is outstanding. */
  async validate(id: string) {
    const payrun = await this.findOne(id);

    if (payrun.state === PayrunState.DRAFT) {
      throw new BadRequestException('Compute the payrun before validating it.');
    }
    if (payrun.blockingWarnings.length) {
      throw new BadRequestException(
        `Cannot validate — ${payrun.blockingWarnings.length} blocking issue(s): ` +
          payrun.blockingWarnings.map((w) => w.message).join(' | '),
      );
    }

    await this.prisma.$transaction([
      this.prisma.payslip.updateMany({
        where: { payrunId: id },
        data: { state: PayslipState.VALIDATED },
      }),
      this.prisma.payrun.update({
        where: { id },
        data: { state: PayrunState.VALIDATED, validatedAt: new Date() },
      }),
    ]);

    return this.findOne(id);
  }

  /** MARK PAID — the batch becomes immutable history. */
  async markPaid(id: string) {
    const payrun = await this.prisma.payrun.findUniqueOrThrow({ where: { id } });
    if (payrun.state !== PayrunState.VALIDATED) {
      throw new BadRequestException('Validate the payrun before marking it paid.');
    }

    await this.prisma.$transaction([
      this.prisma.payslip.updateMany({
        where: { payrunId: id },
        data: { state: PayslipState.PAID },
      }),
      this.prisma.payrun.update({
        where: { id },
        data: { state: PayrunState.PAID, paidAt: new Date() },
      }),
    ]);

    return this.findOne(id);
  }

  /** SEND PAYSLIPS — bulk email with the PDF attached. */
  async sendPayslips(id: string) {
    const payrun = await this.prisma.payrun.findUniqueOrThrow({
      where: { id },
      include: { payslips: { include: { employee: true } } },
    });

    const sent: string[] = [];
    const skipped: { employee: string; reason: string }[] = [];

    for (const payslip of payrun.payslips) {
      if (!payslip.employee.workEmail) {
        skipped.push({
          employee: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
          reason: 'No work email',
        });
        continue;
      }

      const pdf = await this.pdf.renderPayslip(payslip.id);
      await this.mail.sendPayslip({
        to: payslip.employee.workEmail,
        employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
        period: payrun.name,
        netAmount: Number(payslip.netAmount),
        pdf,
        fileName: `${payslip.number.replace(/\//g, '-')}.pdf`,
      });

      await this.prisma.payslip.update({
        where: { id: payslip.id },
        data: { sentAt: new Date() },
      });
      sent.push(payslip.employee.workEmail);
    }

    return { sent: sent.length, skipped, recipients: sent };
  }

  async remove(id: string) {
    const payrun = await this.prisma.payrun.findUniqueOrThrow({ where: { id } });
    if (payrun.state === PayrunState.PAID) {
      throw new BadRequestException('Paid payroll must be preserved as historical data.');
    }
    return this.prisma.payrun.delete({ where: { id } });
  }
}
