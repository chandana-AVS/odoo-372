import { BadRequestException, Injectable } from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContractResolver } from '../payroll/engine/contract-resolver';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ContractResolver,
  ) {}

  findAll(query: { employeeId?: string; status?: string }) {
    return this.prisma.contract.findMany({
      where: {
        employeeId: query.employeeId || undefined,
        status: (query.status as ContractStatus) || undefined,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, code: true } },
        department: true,
        jobPosition: true,
        salaryStructure: { select: { id: true, name: true } },
        workingSchedule: { select: { id: true, name: true } },
      },
      // Running contracts float to the top so the active one is obvious.
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    });
  }

  findOne(id: string) {
    return this.prisma.contract.findUniqueOrThrow({
      where: { id },
      include: {
        employee: true,
        department: true,
        jobPosition: true,
        salaryStructure: { include: { rules: { orderBy: { sequence: 'asc' } } } },
        workingSchedule: { include: { lines: true } },
      },
    });
  }

  async create(data: any) {
    const startDate = new Date(data.startDate);
    const endDate = data.endDate ? new Date(data.endDate) : null;

    if (data.status === ContractStatus.RUNNING) {
      await this.assertNoOverlap(data.employeeId, startDate, endDate);
    }

    return this.prisma.contract.create({
      data: {
        ...data,
        startDate,
        endDate,
        reference: data.reference || (await this.nextReference(startDate)),
        wage: new Prisma.Decimal(data.wage ?? 0),
      },
    });
  }

  async update(id: string, data: any) {
    const current = await this.prisma.contract.findUniqueOrThrow({ where: { id } });
    const startDate = data.startDate ? new Date(data.startDate) : current.startDate;
    const endDate =
      data.endDate === undefined ? current.endDate : data.endDate ? new Date(data.endDate) : null;
    const status = data.status ?? current.status;

    if (status === ContractStatus.RUNNING) {
      await this.assertNoOverlap(current.employeeId, startDate, endDate, id);
    }

    return this.prisma.contract.update({
      where: { id },
      data: {
        ...data,
        startDate,
        endDate,
        wage: data.wage !== undefined ? new Prisma.Decimal(data.wage) : undefined,
      },
    });
  }

  /** Explicit activation endpoint — runs the I1 overlap check. */
  async activate(id: string) {
    const contract = await this.prisma.contract.findUniqueOrThrow({ where: { id } });
    await this.assertNoOverlap(contract.employeeId, contract.startDate, contract.endDate, id);
    return this.prisma.contract.update({
      where: { id },
      data: { status: ContractStatus.RUNNING },
    });
  }

  remove(id: string) {
    return this.prisma.contract.delete({ where: { id } });
  }

  /**
   * Invariant I1 — one employee must not hold two RUNNING contracts whose
   * date ranges overlap.
   */
  private async assertNoOverlap(
    employeeId: string,
    startDate: Date,
    endDate: Date | null,
    excludeId?: string,
  ) {
    const clashes = await this.resolver.findOverlapping(
      employeeId,
      startDate,
      endDate,
      excludeId,
    );
    if (clashes.length) {
      throw new BadRequestException(
        `This employee already has a running contract (${clashes
          .map((c) => c.reference)
          .join(', ')}) overlapping these dates. End or cancel it first.`,
      );
    }
  }

  private async nextReference(startDate: Date): Promise<string> {
    const prefix = `CON/${startDate.getFullYear()}`;
    const count = await this.prisma.contract.count({
      where: { reference: { startsWith: prefix } },
    });
    return `${prefix}/${String(count + 1).padStart(4, '0')}`;
  }
}
