import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AllocationState, Prisma, RoleName, TimeOffState } from '@prisma/client';
import { AuthUser, canSeeAllRecords } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanDecide,
  hrStaffEmployeeIds,
  isHrStaff,
} from '../common/approval-policy';

@Injectable()
export class TimeOffService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------- types
  listTypes() {
    return this.prisma.timeOffType.findMany({
      include: { _count: { select: { requests: true, allocations: true } } },
      orderBy: { name: 'asc' },
    });
  }

  createType(data: any) {
    return this.prisma.timeOffType.create({ data });
  }

  updateType(id: string, data: any) {
    return this.prisma.timeOffType.update({ where: { id }, data });
  }

  // -------------------------------------------------------- allocations
  listAllocations(user: AuthUser, query: { employeeId?: string; state?: string }) {
    return this.prisma.timeOffAllocation.findMany({
      where: {
        employeeId: canSeeAllRecords(user)
          ? query.employeeId || undefined
          : user.employeeId ?? '__none__',
        state: (query.state as AllocationState) || undefined,
      },
      include: {
        employee: { select: {
          id: true,
          firstName: true,
          lastName: true,
          code: true,
          gender: true,
          avatarUrl: true,
        } },
        type: true,
        _count: { select: { requests: true } },
      },
      orderBy: { validFrom: 'desc' },
    });
  }

  createAllocation(data: any) {
    return this.prisma.timeOffAllocation.create({
      data: {
        employeeId: data.employeeId,
        typeId: data.typeId,
        allocatedQty: new Prisma.Decimal(data.allocatedQty),
        validFrom: new Date(data.validFrom),
        validTo: new Date(data.validTo),
        description: data.description,
      },
    });
  }

  updateAllocation(id: string, data: any) {
    return this.prisma.timeOffAllocation.update({
      where: { id },
      data: {
        allocatedQty:
          data.allocatedQty !== undefined ? new Prisma.Decimal(data.allocatedQty) : undefined,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validTo: data.validTo ? new Date(data.validTo) : undefined,
        description: data.description,
      },
    });
  }

  /** An allocation only becomes usable balance once approved. */
  approveAllocation(user: AuthUser, id: string) {
    return this.prisma.timeOffAllocation.update({
      where: { id },
      data: { state: AllocationState.APPROVED, approvedById: user.id },
    });
  }

  refuseAllocation(user: AuthUser, id: string) {
    return this.prisma.timeOffAllocation.update({
      where: { id },
      data: { state: AllocationState.REFUSED, approvedById: user.id },
    });
  }

  // ----------------------------------------------------------- requests
  async listRequests(user: AuthUser, query: { employeeId?: string; state?: string }) {
    // HR-raised leave escalates to an admin, so it is hidden from HR reviewers.
    const hideHrRaised =
      !user.roles.includes(RoleName.ADMIN) && isHrStaff(user.roles) && !query.employeeId;
    const excludeIds = hideHrRaised ? await hrStaffEmployeeIds(this.prisma) : [];

    return this.prisma.timeOffRequest.findMany({
      where: {
        employeeId: canSeeAllRecords(user)
          ? query.employeeId || (excludeIds.length ? { notIn: excludeIds } : undefined)
          : user.employeeId ?? '__none__',
        state: (query.state as TimeOffState) || undefined,
      },
      include: {
        employee: { select: {
          id: true,
          firstName: true,
          lastName: true,
          code: true,
          gender: true,
          avatarUrl: true,
        } },
        type: true,
        allocation: { select: { id: true, allocatedQty: true, takenQty: true } },
        approvedBy: { select: { email: true } },
      },
      // Newest submission first, so a request just raised appears at the top
      // even when its leave dates are in the past.
      orderBy: [{ createdAt: 'desc' }, { dateFrom: 'desc' }],
    });
  }

  findRequest(id: string) {
    return this.prisma.timeOffRequest.findUniqueOrThrow({
      where: { id },
      include: { employee: true, type: true, allocation: true, approvedBy: true },
    });
  }

  async createRequest(user: AuthUser, data: any) {
    const employeeId = canSeeAllRecords(user)
      ? (data.employeeId ?? user.employeeId)
      : user.employeeId;
    if (!employeeId) throw new ForbiddenException('No employee linked to this account.');

    const dateFrom = new Date(data.dateFrom);
    const dateTo = new Date(data.dateTo);
    if (dateTo < dateFrom) throw new BadRequestException('End date is before start date.');

    const duration =
      data.duration ?? Math.floor((dateTo.getTime() - dateFrom.getTime()) / 86_400_000) + 1;

    return this.prisma.timeOffRequest.create({
      data: {
        employeeId,
        typeId: data.typeId,
        dateFrom,
        dateTo,
        duration: new Prisma.Decimal(duration),
        description: data.description,
        state: TimeOffState.SUBMITTED,
      },
    });
  }

  /**
   * Roles held by the person a request belongs to. Drives the escalation rule:
   * an HR member's own request can only be decided by an admin.
   */
  private async rolesOfEmployee(employeeId: string): Promise<RoleName[]> {
    const account = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { roles: { include: { role: true } } },
    });
    return (account?.roles ?? []).map((ur) => ur.role.name);
  }

  /**
   * INVARIANT I3 — approving a request consumes allocation balance, in one
   * transaction, and refuses to let the balance go negative.
   */
  async approveRequest(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.timeOffRequest.findUniqueOrThrow({
        where: { id },
        include: { type: true },
      });

      if (request.state === TimeOffState.APPROVED) {
        throw new BadRequestException('Request is already approved.');
      }

      // Nobody signs off their own leave, and HR's own leave escalates to admin.
      assertCanDecide({
        decider: user,
        requesterEmployeeId: request.employeeId,
        requesterRoles: await this.rolesOfEmployee(request.employeeId),
        subject: 'leave request',
      });

      let allocationId: string | null = null;

      if (request.type.requiresAllocation) {
        const allocation = await tx.timeOffAllocation.findFirst({
          where: {
            employeeId: request.employeeId,
            typeId: request.typeId,
            state: AllocationState.APPROVED,
            validFrom: { lte: request.dateFrom },
            validTo: { gte: request.dateTo },
          },
          orderBy: { validFrom: 'asc' },
        });

        if (!allocation) {
          throw new NotFoundException(
            `No approved ${request.type.name} allocation covers ${request.dateFrom
              .toISOString()
              .slice(0, 10)} – ${request.dateTo.toISOString().slice(0, 10)}.`,
          );
        }

        const newTaken = Number(allocation.takenQty) + Number(request.duration);
        if (newTaken > Number(allocation.allocatedQty)) {
          const remaining = Number(allocation.allocatedQty) - Number(allocation.takenQty);
          throw new BadRequestException(
            `Insufficient balance: ${remaining} ${request.type.unit.toLowerCase()}(s) remaining, ` +
              `${Number(request.duration)} requested.`,
          );
        }

        await tx.timeOffAllocation.update({
          where: { id: allocation.id },
          data: { takenQty: new Prisma.Decimal(newTaken) },
        });
        allocationId = allocation.id;
      }

      return tx.timeOffRequest.update({
        where: { id },
        data: {
          state: TimeOffState.APPROVED,
          allocationId,
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: { type: true, allocation: true },
      });
    });
  }

  async refuseRequest(user: AuthUser, id: string, reason?: string) {
    const existing = await this.prisma.timeOffRequest.findUniqueOrThrow({
      where: { id },
      select: { employeeId: true },
    });
    assertCanDecide({
      decider: user,
      requesterEmployeeId: existing.employeeId,
      requesterRoles: await this.rolesOfEmployee(existing.employeeId),
      subject: 'leave request',
    });

    return this.prisma.timeOffRequest.update({
      where: { id },
      data: {
        state: TimeOffState.REFUSED,
        approvedById: user.id,
        approvedAt: new Date(),
        refusalReason: reason,
      },
    });
  }

  /** Cancelling an approved request gives the balance back. */
  async cancelRequest(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.timeOffRequest.findUniqueOrThrow({ where: { id } });

      if (request.state === TimeOffState.APPROVED && request.allocationId) {
        const allocation = await tx.timeOffAllocation.findUniqueOrThrow({
          where: { id: request.allocationId },
        });
        await tx.timeOffAllocation.update({
          where: { id: allocation.id },
          data: {
            takenQty: new Prisma.Decimal(
              Math.max(0, Number(allocation.takenQty) - Number(request.duration)),
            ),
          },
        });
      }

      return tx.timeOffRequest.update({
        where: { id },
        data: { state: TimeOffState.CANCELLED, allocationId: null },
      });
    });
  }
}
