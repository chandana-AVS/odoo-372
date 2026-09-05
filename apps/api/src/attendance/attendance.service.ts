import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { AuthUser, canSeeAllRecords } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

const LATE_AFTER_HOUR = 9;
const OVERTIME_AFTER_HOURS = 9;

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private targetEmployee(user: AuthUser, requested?: string): string {
    if (canSeeAllRecords(user)) return requested ?? user.employeeId ?? '';
    if (requested && requested !== user.employeeId) {
      throw new ForbiddenException('You can only access your own attendance.');
    }
    if (!user.employeeId) throw new ForbiddenException('No employee linked to this account.');
    return user.employeeId;
  }

  findAll(user: AuthUser, query: { employeeId?: string; from?: string; to?: string }) {
    const where: Prisma.AttendanceWhereInput = {
      employeeId: canSeeAllRecords(user)
        ? query.employeeId || undefined
        : user.employeeId ?? '__none__',
      date: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
    };
    return this.prisma.attendance.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, code: true } },
        editedBy: { select: { email: true } },
      },
      orderBy: [{ date: 'desc' }, { checkIn: 'desc' }],
      take: 500,
    });
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

    return this.prisma.attendance.update({
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
