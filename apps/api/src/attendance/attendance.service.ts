import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  AttendanceRequestState,
  AttendanceRequestType,
  AttendanceStatus,
  Prisma,
  RoleName,
} from '@prisma/client';
import { AuthUser, canSeeAllRecords } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanDecide, hrStaffEmployeeIds, isHrStaff } from '../common/approval-policy';
import { MailService } from '../shared/mail.service';
import { isWeekendDate, quoteOvertime } from './overtime.util';

const LATE_AFTER_HOUR = 9;
const OVERTIME_AFTER_HOURS = 9;

/** A standard working day. Anything else needs an explanation. */
export const STANDARD_DAY_HOURS = 8;
/** Tolerance either side of 8h before a confirmation is demanded (2 minutes). */
const GRACE_HOURS = 0.034;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private targetEmployee(user: AuthUser, requested?: string): string {
    if (canSeeAllRecords(user)) return requested ?? user.employeeId ?? '';
    if (requested && requested !== user.employeeId) {
      throw new ForbiddenException('You can only access your own attendance.');
    }
    if (!user.employeeId) throw new ForbiddenException('No employee linked to this account.');
    return user.employeeId;
  }

  /** Rows per page. A month at 200 staff is thousands of rows — never send all. */
  private static readonly PAGE_SIZE = 50;

  /**
   * One page of attendance, plus the total so the UI can render a pager.
   * Previously this returned a flat array capped at 500, which silently hid
   * everything beyond the cap.
   */
  async findAll(
    user: AuthUser,
    query: { employeeId?: string; from?: string; to?: string; page?: string; pageSize?: string },
  ) {
    const where: Prisma.AttendanceWhereInput = {
      employeeId: canSeeAllRecords(user)
        ? query.employeeId || undefined
        : user.employeeId ?? '__none__',
      date: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
    };

    const pageSize = Math.min(
      Math.max(Number(query.pageSize) || AttendanceService.PAGE_SIZE, 1),
      200,
    );
    const page = Math.max(Number(query.page) || 1, 1);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.findMany({
        where,
        include: {
          employee: { select: {
          id: true,
          firstName: true,
          lastName: true,
          code: true,
          gender: true,
          avatarUrl: true,
        } },
          editedBy: { select: { email: true } },
          // Lets the UI mark days that still need an explanation.
          request: { select: { id: true, state: true, type: true } },
        },
        orderBy: [{ date: 'desc' }, { checkIn: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { rows, total, page, pageSize, pageCount: Math.max(Math.ceil(total / pageSize), 1) };
  }

  findOne(id: string) {
    return this.prisma.attendance.findUniqueOrThrow({
      where: { id },
      include: { employee: true, editedBy: { select: { email: true } } },
    });
  }

  /** Drives the navbar widget colour: null = red (Check In), row = green. */
  async current(user: AuthUser, employeeId?: string) {
    const target = this.targetEmployee(user, employeeId);
    const open = await this.prisma.attendance.findFirst({
      where: { employeeId: target, checkOut: null },
      orderBy: { checkIn: 'desc' },
    });
    if (!open) return { checkedIn: false, session: null, elapsedMinutes: 0, todayHours: 0 };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = await this.prisma.attendance.aggregate({
      where: { employeeId: target, date: { gte: todayStart } },
      _sum: { workedHours: true },
    });

    const elapsedMinutes = Math.floor((Date.now() - open.checkIn.getTime()) / 60000);
    return {
      checkedIn: true,
      session: open,
      elapsedMinutes,
      todayHours:
        Math.round((Number(today._sum.workedHours ?? 0) + elapsedMinutes / 60) * 100) / 100,
    };
  }

  async checkIn(user: AuthUser, employeeId?: string) {
    const target = this.targetEmployee(user, employeeId);
    const open = await this.prisma.attendance.findFirst({
      where: { employeeId: target, checkOut: null },
    });
    if (open) throw new BadRequestException('Already checked in. Check out first.');

    const now = new Date();
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);

    return this.prisma.attendance.create({
      data: {
        employeeId: target,
        date,
        checkIn: now,
        status: now.getHours() >= LATE_AFTER_HOUR ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
      },
    });
  }

  async checkOut(user: AuthUser, employeeId?: string) {
    const target = this.targetEmployee(user, employeeId);
    const open = await this.prisma.attendance.findFirst({
      where: { employeeId: target, checkOut: null },
      orderBy: { checkIn: 'desc' },
    });
    if (!open) throw new BadRequestException('No open attendance session to check out of.');

    const now = new Date();
    const workedHours = Math.round(((now.getTime() - open.checkIn.getTime()) / 3_600_000) * 100) / 100;

    const updated = await this.prisma.attendance.update({
      where: { id: open.id },
      data: {
        checkOut: now,
        workedHours,
        status:
          workedHours >= OVERTIME_AFTER_HOURS
            ? AttendanceStatus.OVERTIME
            : open.status === AttendanceStatus.LATE
              ? AttendanceStatus.LATE
              : AttendanceStatus.PRESENT,
      },
    });

    // The client shows a confirmation dialog only when the day was not a
    // standard 8 hours; `requiresConfirmation` is what drives that.
    const deltaHours = Math.round((workedHours - STANDARD_DAY_HOURS) * 100) / 100;
    const requiresConfirmation = Math.abs(deltaHours) > GRACE_HOURS;

    return {
      ...updated,
      deltaHours,
      requiresConfirmation,
      suggestedType:
        deltaHours > 0 ? AttendanceRequestType.EXTRA_TIME : AttendanceRequestType.EARLY_LOGOUT,
    };
  }

  /* ---------------------------------------------------------------- requests */

  /**
   * Raise the explanation request for a day that was not 8 hours. One request
   * per attendance row — the unique index enforces it, and re-submitting a
   * pending one just updates the reason.
   */
  async submitRequest(
    user: AuthUser,
    input: { attendanceId: string; type: string; reason: string },
  ) {
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new BadRequestException('A reason is required.');
    if (
      input.type !== AttendanceRequestType.EXTRA_TIME &&
      input.type !== AttendanceRequestType.EARLY_LOGOUT
    ) {
      throw new BadRequestException('Choose either extra time or early logout.');
    }

    const attendance = await this.prisma.attendance.findUniqueOrThrow({
      where: { id: input.attendanceId },
      include: { request: true },
    });

    // An employee may only explain their own day.
    if (!canSeeAllRecords(user) && attendance.employeeId !== user.employeeId) {
      throw new ForbiddenException('You can only raise requests for your own attendance.');
    }
    if (!attendance.checkOut) {
      throw new BadRequestException('Check out before raising a request.');
    }

    const workedHours = Number(attendance.workedHours);
    const deltaHours = Math.round((workedHours - STANDARD_DAY_HOURS) * 100) / 100;
    if (Math.abs(deltaHours) <= GRACE_HOURS) {
      throw new BadRequestException('This day was a standard 8 hours — no request needed.');
    }

    // A decided request is final; only a pending one can be revised.
    if (attendance.request && attendance.request.state !== AttendanceRequestState.PENDING) {
      throw new BadRequestException(
        `This day was already reviewed (${attendance.request.state.toLowerCase()}).`,
      );
    }

    const data = {
      attendanceId: attendance.id,
      employeeId: attendance.employeeId,
      date: attendance.date,
      workedHours: new Prisma.Decimal(workedHours),
      deltaHours: new Prisma.Decimal(deltaHours),
      type: input.type as AttendanceRequestType,
      reason,
      isWeekend: isWeekendDate(attendance.date),
    };

    const saved = await this.prisma.attendanceRequest.upsert({
      where: { attendanceId: attendance.id },
      create: data,
      update: { type: data.type, reason: data.reason, isWeekend: data.isWeekend },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            code: true,
            manager: { select: { firstName: true, lastName: true, workEmail: true } },
          },
        },
      },
    });

    // Tell the employee's superior. Never let a mail failure lose the request.
    await this.notifyManager(saved).catch((error) =>
      this.logger.warn(`Could not notify manager: ${(error as Error).message}`),
    );

    return saved;
  }

  /** Email the employee's manager that a request needs their attention. */
  private async notifyManager(request: any) {
    const manager = request.employee?.manager;
    if (!manager?.workEmail) return;

    const employeeName = `${request.employee.firstName} ${request.employee.lastName}`;
    const delta = Number(request.deltaHours);
    const isExtra = delta > 0;

    await this.mail.sendAttendanceRequestNotice({
      to: manager.workEmail,
      managerName: `${manager.firstName} ${manager.lastName}`,
      employeeName,
      employeeCode: request.employee.code,
      date: request.date,
      workedHours: Number(request.workedHours),
      deltaHours: delta,
      type: isExtra ? 'Extra Time' : 'Early Logout',
      reason: request.reason,
    });
  }

  /**
   * HR decision. Approving overtime prices it at that moment and stores the
   * figure, so payroll pays exactly what was approved.
   */
  async decideRequest(
    user: AuthUser,
    id: string,
    input: { state: string; note?: string },
  ) {
    if (
      input.state !== AttendanceRequestState.APPROVED &&
      input.state !== AttendanceRequestState.REJECTED
    ) {
      throw new BadRequestException('Decision must be approved or rejected.');
    }

    const request = await this.prisma.attendanceRequest.findUniqueOrThrow({
      where: { id },
      include: { employee: { select: { firstName: true, lastName: true, workEmail: true } } },
    });
    if (request.state !== AttendanceRequestState.PENDING) {
      throw new BadRequestException(`This request was already ${request.state.toLowerCase()}.`);
    }

    // Same rule as leave: no self-approval, and HR's own request goes to admin.
    const account = await this.prisma.user.findUnique({
      where: { employeeId: request.employeeId },
      include: { roles: { include: { role: true } } },
    });
    assertCanDecide({
      decider: user,
      requesterEmployeeId: request.employeeId,
      requesterRoles: (account?.roles ?? []).map((ur) => ur.role.name),
      subject: 'attendance request',
    });

    const approving = input.state === AttendanceRequestState.APPROVED;
    const delta = Number(request.deltaHours);

    // Only genuine extra time earns money; an approved early logout simply
    // excuses the shortfall.
    let approvedAmount: Prisma.Decimal | null = null;
    if (approving && request.type === AttendanceRequestType.EXTRA_TIME && delta > 0) {
      const contract = await this.prisma.contract.findFirst({
        where: {
          employeeId: request.employeeId,
          startDate: { lte: request.date },
          OR: [{ endDate: null }, { endDate: { gte: request.date } }],
        },
        orderBy: { startDate: 'desc' },
      });
      const quote = quoteOvertime(Number(contract?.wage ?? 0), delta, request.isWeekend);
      approvedAmount = new Prisma.Decimal(quote.amount);
    }

    const decided = await this.prisma.attendanceRequest.update({
      where: { id },
      data: {
        state: input.state as AttendanceRequestState,
        decisionNote: input.note?.trim() || null,
        decidedById: user.id,
        decidedAt: new Date(),
        approvedAmount,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, code: true, workEmail: true } },
      },
    });

    await this.mail
      .sendAttendanceRequestDecision({
        to: decided.employee.workEmail,
        employeeName: `${decided.employee.firstName} ${decided.employee.lastName}`,
        date: decided.date,
        approved: approving,
        note: decided.decisionNote,
        amount: approvedAmount ? Number(approvedAmount) : null,
      })
      .catch((error) =>
        this.logger.warn(`Could not notify employee: ${(error as Error).message}`),
      );

    return decided;
  }

  /** What approved overtime would be worth, for the confirmation dialog. */
  async quoteFor(attendanceId: string) {
    const attendance = await this.prisma.attendance.findUniqueOrThrow({
      where: { id: attendanceId },
    });
    const delta = Number(attendance.workedHours) - STANDARD_DAY_HOURS;
    if (delta <= 0) return null;

    const contract = await this.prisma.contract.findFirst({
      where: {
        employeeId: attendance.employeeId,
        startDate: { lte: attendance.date },
        OR: [{ endDate: null }, { endDate: { gte: attendance.date } }],
      },
      orderBy: { startDate: 'desc' },
    });
    return quoteOvertime(Number(contract?.wage ?? 0), delta, isWeekendDate(attendance.date));
  }

  /** The employee's own request history — drives the status list. */
  async listRequests(user: AuthUser, query: { employeeId?: string; state?: string }) {
    // HR-raised requests escalate to an admin, so HR reviewers never see them —
    // not even their own. Admins see everything.
    const hideHrRaised =
      !user.roles.includes(RoleName.ADMIN) && isHrStaff(user.roles) && !query.employeeId;
    const excludeIds = hideHrRaised ? await hrStaffEmployeeIds(this.prisma) : [];

    return this.prisma.attendanceRequest.findMany({
      where: {
        employeeId: canSeeAllRecords(user)
          ? query.employeeId || (excludeIds.length ? { notIn: excludeIds } : undefined)
          : user.employeeId ?? '__none__',
        state: (query.state as AttendanceRequestState) || undefined,
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
        decidedBy: { select: { email: true } },
      },
      // Newest submission first. Ordering by the attendance `date` buried a
      // request raised today for an older day somewhere down the list.
      orderBy: [{ createdAt: 'desc' }, { date: 'desc' }],
      take: 200,
    });
  }

  create(data: any) {
    const checkIn = new Date(data.checkIn);
    const checkOut = data.checkOut ? new Date(data.checkOut) : null;
    const date = new Date(checkIn);
    date.setHours(0, 0, 0, 0);
    return this.prisma.attendance.create({
      data: {
        employeeId: data.employeeId,
        date,
        checkIn,
        checkOut,
        workedHours: checkOut
          ? Math.round(((checkOut.getTime() - checkIn.getTime()) / 3_600_000) * 100) / 100
          : 0,
        status: data.status ?? AttendanceStatus.PRESENT,
        notes: data.notes,
      },
    });
  }

  /** Manual correction — always stamped so the dashboard can surface it. */
  async correct(user: AuthUser, id: string, data: any) {
    if (!canSeeAllRecords(user)) {
      throw new ForbiddenException('Attendance corrections are restricted to HR users.');
    }
    const checkIn = data.checkIn ? new Date(data.checkIn) : undefined;
    const checkOut = data.checkOut === null ? null : data.checkOut ? new Date(data.checkOut) : undefined;

    const current = await this.prisma.attendance.findUniqueOrThrow({ where: { id } });
    const finalIn = checkIn ?? current.checkIn;
    const finalOut = checkOut === undefined ? current.checkOut : checkOut;

    return this.prisma.attendance.update({
      where: { id },
      data: {
        checkIn: finalIn,
        checkOut: finalOut,
        workedHours: finalOut
          ? Math.round(((finalOut.getTime() - finalIn.getTime()) / 3_600_000) * 100) / 100
          : 0,
        status: data.status ?? current.status,
        notes: data.notes ?? current.notes,
        isManualEdit: true,
        editedById: user.id,
      },
    });
  }

  remove(id: string) {
    return this.prisma.attendance.delete({ where: { id } });
  }
}
