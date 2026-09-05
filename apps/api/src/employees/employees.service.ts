import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ContractStatus, Prisma, TimeOffState } from '@prisma/client';
import { AuthUser, canSeeAllRecords } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** An EMPLOYEE only ever sees their own record. */
  private scope(user: AuthUser): Prisma.EmployeeWhereInput {
    return canSeeAllRecords(user) ? {} : { id: user.employeeId ?? '__none__' };
  }

  async findAll(user: AuthUser, query: {
    q?: string;
    departmentId?: string;
    employeeType?: string;
    isActive?: string;
  }) {
    const where: Prisma.EmployeeWhereInput = {
      ...this.scope(user),
      departmentId: query.departmentId || undefined,
      employeeType: (query.employeeType as any) || undefined,
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { workEmail: { contains: query.q, mode: 'insensitive' } },
              { code: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.employee.findMany({
      where,
      include: {
        department: true,
        jobPosition: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        workingSchedule: { select: { id: true, name: true } },
      },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
    });
  }

  async findOne(user: AuthUser, id: string) {
    if (!canSeeAllRecords(user) && user.employeeId !== id) {
      throw new ForbiddenException('You can only view your own employee record.');
    }
    return this.prisma.employee.findUniqueOrThrow({
      where: { id },
      include: {
        company: true,
        department: true,
        jobPosition: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        workingSchedule: { include: { lines: true } },
        user: { select: { id: true, email: true } },
      },
    });
  }

  /** Powers the smart buttons: Contracts 2 · Attendance 14 · Time Off 3. */
  async summary(user: AuthUser, id: string) {
    if (!canSeeAllRecords(user) && user.employeeId !== id) {
      throw new ForbiddenException('You can only view your own employee record.');
    }
    const [contracts, attendance, timeOff, allocations, activeContract] = await Promise.all([
      this.prisma.contract.count({ where: { employeeId: id } }),
      this.prisma.attendance.count({ where: { employeeId: id } }),
      this.prisma.timeOffRequest.count({ where: { employeeId: id } }),
      this.prisma.timeOffAllocation.count({ where: { employeeId: id } }),
      this.prisma.contract.findFirst({
        where: { employeeId: id, status: ContractStatus.RUNNING },
        include: { salaryStructure: true, workingSchedule: true },
      }),
    ]);

    const balances = await this.balances(id);
    return { contracts, attendance, timeOff, allocations, activeContract, balances };
  }

  /** Leave balance per type: allocated − taken (invariant I3). */
  async balances(employeeId: string) {
    const allocations = await this.prisma.timeOffAllocation.findMany({
      where: { employeeId, state: 'APPROVED' },
      include: { type: true },
    });

    const pending = await this.prisma.timeOffRequest.groupBy({
      by: ['typeId'],
      where: { employeeId, state: TimeOffState.SUBMITTED },
      _sum: { duration: true },
    });

    const byType = new Map<string, any>();
    for (const a of allocations) {
      const entry = byType.get(a.typeId) ?? {
        typeId: a.typeId,
        type: a.type.name,
        unit: a.type.unit,
        color: a.type.color,
        allocated: 0,
        taken: 0,
        remaining: 0,
        pending: 0,
      };
      entry.allocated += Number(a.allocatedQty);
      entry.taken += Number(a.takenQty);
      entry.remaining = entry.allocated - entry.taken;
      byType.set(a.typeId, entry);
    }
    for (const p of pending) {
      const entry = byType.get(p.typeId);
      if (entry) entry.pending = Number(p._sum.duration ?? 0);
    }
    return [...byType.values()];
  }

  async create(input: any) {
    const data = this.sanitise(input);

    if (!data.firstName || !data.lastName) {
      throw new BadRequestException('First name and last name are required.');
    }
    if (!data.workEmail) {
      throw new BadRequestException('A work email is required.');
    }
    await this.assertEmailFree(data.workEmail);

    // Both are required by the schema but tedious to ask for in the form.
    data.companyId = data.companyId ?? (await this.prisma.company.findFirstOrThrow()).id;
    data.code = data.code ?? (await this.nextCode());

    if (await this.prisma.employee.findUnique({ where: { code: data.code } })) {
      throw new BadRequestException(`Employee code ${data.code} is already taken.`);
    }

    return this.prisma.employee.create({
      data: data as Prisma.EmployeeUncheckedCreateInput,
      include: { department: true, jobPosition: true },
    });
  }

  async update(id: string, input: any) {
    const data = this.sanitise(input);

    if (data.workEmail) await this.assertEmailFree(data.workEmail, id);
    if (data.managerId === id) {
      throw new BadRequestException('An employee cannot be their own manager.');
    }

    // `code` and `companyId` are identity — never changed by an edit.
    delete data.code;
    delete data.companyId;

    return this.prisma.employee.update({
      where: { id },
      data: data as Prisma.EmployeeUncheckedUpdateInput,
      include: { department: true, jobPosition: true },
    });
  }

  /**
   * Turns a loose form body into something Prisma accepts: unknown keys dropped,
   * blank optional fields (including unselected dropdowns) coerced to null so a
   * "" never reaches a foreign key.
   */
  private sanitise(input: any): Record<string, any> {
    const strings = [
      'firstName',
      'lastName',
      'workEmail',
      'personalEmail',
      'phone',
      'workLocation',
      'bankAccount',
      'avatarUrl',
      'code',
    ];
    const relations = [
      'departmentId',
      'jobPositionId',
      'managerId',
      'workingScheduleId',
      'companyId',
    ];

    const data: Record<string, any> = {};

    for (const key of strings) {
      if (input[key] === undefined) continue;
      const value = typeof input[key] === 'string' ? input[key].trim() : input[key];
      data[key] = value === '' ? null : value;
    }
    for (const key of relations) {
      if (input[key] === undefined) continue;
      data[key] = input[key] === '' || input[key] === null ? null : input[key];
    }

    if (input.employeeType !== undefined) data.employeeType = input.employeeType;
    if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);

    // Required fields must not be nulled out by an edit.
    for (const key of ['firstName', 'lastName', 'workEmail']) {
      if (data[key] === null) delete data[key];
    }
    if (data.workEmail) data.workEmail = String(data.workEmail).toLowerCase();

    return data;
  }

  private async assertEmailFree(workEmail: string, excludeId?: string) {
    const existing = await this.prisma.employee.findUnique({
      where: { workEmail: workEmail.toLowerCase() },
      select: { id: true },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`${workEmail} is already used by another employee.`);
    }
  }

  /** EMP0001, EMP0002, … continuing past the highest existing code. */
  private async nextCode(): Promise<string> {
    const last = await this.prisma.employee.findFirst({
      where: { code: { startsWith: 'EMP' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const next = last ? Number(last.code.replace(/\D/g, '')) + 1 : 1;
    return `EMP${String(next).padStart(4, '0')}`;
  }

  /** Fed to the employee form's dropdowns. */
  companies() {
    return this.prisma.company.findMany({ orderBy: { name: 'asc' } });
  }

  remove(id: string) {
    // Archive rather than delete — payroll history must survive.
    return this.prisma.employee.update({ where: { id }, data: { isActive: false } });
  }

  departments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  jobPositions() {
    return this.prisma.jobPosition.findMany({ orderBy: { name: 'asc' } });
  }
}
