import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { scheduleDaysPerWeek, scheduleHoursPerWeek } from './schedule.util';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  /** hoursPerWeek / daysPerWeek are always derived, never stored. */
  private decorate<T extends { lines: any[] }>(schedule: T) {
    return {
      ...schedule,
      hoursPerWeek: scheduleHoursPerWeek(schedule.lines),
      daysPerWeek: scheduleDaysPerWeek(schedule.lines),
    };
  }

  async findAll() {
    const schedules = await this.prisma.workingSchedule.findMany({
      include: {
        lines: { orderBy: { dayOfWeek: 'asc' } },
        company: { select: { name: true } },
        _count: { select: { employees: true, contracts: true } },
      },
      orderBy: { name: 'asc' },
    });
    return schedules.map((s) => this.decorate(s));
  }

  async findOne(id: string) {
    const schedule = await this.prisma.workingSchedule.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        company: { select: { name: true } },
      },
    });
    return this.decorate(schedule);
  }

  async create(data: any) {
    const created = await this.prisma.workingSchedule.create({
      data: {
        name: data.name,
        calendarType: data.calendarType ?? 'FULL_TIME',
        companyId: data.companyId,
        lines: { create: (data.lines ?? []).map(this.lineInput) },
      },
      include: { lines: true },
    });
    return this.decorate(created);
  }

  /** Lines are replaced wholesale — the form edits the whole weekly pattern. */
  async update(id: string, data: any) {
    const updated = await this.prisma.$transaction(async (tx) => {
      if (data.lines) {
        await tx.scheduleLine.deleteMany({ where: { scheduleId: id } });
      }
      return tx.workingSchedule.update({
        where: { id },
        data: {
          name: data.name,
          calendarType: data.calendarType,
          isActive: data.isActive,
          ...(data.lines ? { lines: { create: data.lines.map(this.lineInput) } } : {}),
        },
        include: { lines: { orderBy: { dayOfWeek: 'asc' } } },
      });
    });
    return this.decorate(updated);
  }

  remove(id: string) {
    return this.prisma.workingSchedule.update({ where: { id }, data: { isActive: false } });
  }

  private lineInput = (line: any) => ({
    dayOfWeek: Number(line.dayOfWeek),
    startTime: line.startTime,
    endTime: line.endTime,
    breakMinutes: Number(line.breakMinutes ?? 0),
  });
}
