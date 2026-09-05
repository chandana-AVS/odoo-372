import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  ContractStatus,
  PayrunState,
  PayslipState,
  Prisma,
  TimeOffState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollWarning } from '../payroll/engine/types';

export interface DashboardFilters {
  period?: string; // "2026-09"
  departmentId?: string;
  employeeType?: string;
  companyId?: string;
}

/**
 * ONE endpoint aggregating five models (ARCHITECTURE §9). Every number here is
 * derived from live rows — invariant I4.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async build(filters: DashboardFilters) {
    const { start, end } = this.resolvePeriod(filters.period);

    const employeeWhere: Prisma.EmployeeWhereInput = {
      isActive: true,
      departmentId: filters.departmentId || undefined,
      employeeType: (filters.employeeType as any) || undefined,
      companyId: filters.companyId || undefined,
    };

    const payslipWhere: Prisma.PayslipWhereInput = {
      periodStart: { gte: start },
      periodEnd: { lte: end },
      employee: employeeWhere,
    };

    const [
      headcount,
      payslips,
      attendances,
      approvedLeave,
      pendingLeave,
      departments,
      expiringContracts,
      payruns,
      allocations,
    ] = await Promise.all([
      this.prisma.employee.count({ where: employeeWhere }),
      this.prisma.payslip.findMany({
        where: payslipWhere,
        include: {
          employee: { select: { departmentId: true, bankAccount: true } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { date: { gte: start, lte: end }, employee: employeeWhere },
        select: { status: true, workedHours: true, checkOut: true, isManualEdit: true },
      }),
      this.prisma.timeOffRequest.findMany({
        where: {
          state: TimeOffState.APPROVED,
          dateFrom: { lte: end },
          dateTo: { gte: start },
          employee: employeeWhere,
        },
        include: { type: { select: { id: true, name: true, color: true } } },
      }),
      this.prisma.timeOffRequest.count({
        where: { state: TimeOffState.SUBMITTED, employee: employeeWhere },
      }),
      this.prisma.department.findMany({
        include: {
          employees: {
            where: employeeWhere,
            select: {
              id: true,
              contracts: {
                where: { status: ContractStatus.RUNNING },
                select: { wage: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.contract.count({
        where: {
          status: ContractStatus.RUNNING,
          endDate: { gte: start, lte: end },
          employee: employeeWhere,
        },
      }),
      this.prisma.payrun.findMany({
        where: { periodStart: { gte: start }, periodEnd: { lte: end } },
        select: { id: true, name: true, state: true },
      }),
      this.prisma.timeOffAllocation.findMany({
        where: { state: 'APPROVED', employee: employeeWhere },
        include: { type: { select: { id: true, name: true } } },
      }),
    ]);

    // ---------------------------------------------------------- KPI cards
    const totalNet = payslips.reduce((s, p) => s + Number(p.netAmount), 0);
    const paidNet = payslips
      .filter((p) => p.state === PayslipState.PAID)
      .reduce((s, p) => s + Number(p.netAmount), 0);

    const presentish = attendances.filter(
      (a) => a.status !== AttendanceStatus.ABSENT && a.status !== AttendanceStatus.MISSING_CHECKOUT,
    ).length;
    const attendanceHealth =
      attendances.length === 0 ? 100 : Math.round((presentish / attendances.length) * 100);

    const kpis = {
      totalNetSalaryPaid: Math.round(paidNet),
      totalNetSalary: Math.round(totalNet),
      payslipsGenerated: payslips.length,
      avgSalaryPerEmployee: payslips.length ? Math.round(totalNet / payslips.length) : 0,
      approvedTimeOffDays: approvedLeave.reduce((s, r) => s + Number(r.duration), 0),
      attendanceHealth,
      headcount,
    };

    // ------------------------------------------------ salary by department
    const salaryByDepartment = departments
      .map((dept) => ({
        department: dept.name,
        headcount: dept.employees.length,
        salary: Math.round(
          payslips
            .filter((p) => p.employee.departmentId === dept.id)
            .reduce((s, p) => s + Number(p.netAmount), 0),
        ),
        contractedSalary: Math.round(
          dept.employees.reduce((s, e) => s + Number(e.contracts[0]?.wage ?? 0), 0),
        ),
      }))
      .filter((d) => d.headcount > 0)
      .sort((a, b) => b.salary - a.salary);

    // ------------------------------------------------------- salary trend
    const trend = await this.monthlyTrend(employeeWhere, end);

    // ------------------------------------------------------ status splits
    const statusSplit = {
      draft: payslips.filter((p) => p.state === PayslipState.DRAFT).length,
      computed: payslips.filter((p) => p.state === PayslipState.COMPUTED).length,
      validated: payslips.filter((p) => p.state === PayslipState.VALIDATED).length,
      paid: payslips.filter((p) => p.state === PayslipState.PAID).length,
    };

    // ------------------------------------------------------------- alerts
    const warnings = payslips.flatMap(
      (p) => (p.warnings as unknown as PayrollWarning[]) ?? [],
    );
    const countOf = (code: string) => warnings.filter((w) => w.code === code).length;

    const alerts = [
      {
        code: 'MISSING_BANK_ACCOUNT',
        severity: 'warning',
        count: countOf('MISSING_BANK_ACCOUNT'),
        message: 'employees missing bank account',
      },
      {
        code: 'DUPLICATE_PAYSLIP',
        severity: 'blocking',
        count: countOf('DUPLICATE_PAYSLIP'),
        message: 'duplicate payslip warnings',
      },
      {
        code: 'DRAFTS_NOT_VALIDATED',
        severity: 'info',
        count: payruns.filter(
          (r) => r.state === PayrunState.DRAFT || r.state === PayrunState.COMPUTED,
        ).length,
        message: 'payruns still not validated',
      },
      {
        code: 'CONTRACT_EXPIRING',
        severity: 'info',
        count: expiringContracts,
        message: 'contracts expiring this period',
      },
    ].filter((a) => a.count > 0);

    // ------------------------------------------------ attendance overview
    const attendanceOverview = {
      present: attendances.filter((a) => a.status === AttendanceStatus.PRESENT).length,
      late: attendances.filter((a) => a.status === AttendanceStatus.LATE).length,
      absent: attendances.filter((a) => a.status === AttendanceStatus.ABSENT).length,
      overtime: attendances.filter((a) => a.status === AttendanceStatus.OVERTIME).length,
      missingCheckouts: attendances.filter((a) => !a.checkOut).length,
      manualEdits: attendances.filter((a) => a.isManualEdit).length,
      totalHours: Math.round(attendances.reduce((s, a) => s + Number(a.workedHours), 0)),
      coverage: attendanceHealth,
    };

    // --------------------------------------------------- time off overview
    const leaveByType = new Map<string, any>();
    for (const request of approvedLeave) {
      const entry = leaveByType.get(request.type.id) ?? {
        type: request.type.name,
        color: request.type.color,
        approvedDays: 0,
        pending: 0,
        remaining: 0,
      };
      entry.approvedDays += Number(request.duration);
      leaveByType.set(request.type.id, entry);
    }
    for (const allocation of allocations) {
      const entry = leaveByType.get(allocation.type.id) ?? {
        type: allocation.type.name,
        color: '#4f46e5',
        approvedDays: 0,
        pending: 0,
        remaining: 0,
      };
      entry.remaining += Number(allocation.allocatedQty) - Number(allocation.takenQty);
      leaveByType.set(allocation.type.id, entry);
    }

    return {
      period: { start, end, label: this.periodLabel(start) },
      kpis,
      salaryByDepartment,
      monthlyTrend: trend,
      statusSplit,
      alerts,
      attendanceOverview,
      timeOffOverview: {
        byType: [...leaveByType.values()],
        pendingRequests: pendingLeave,
      },
      departmentOverview: salaryByDepartment.map((d) => ({
        department: d.department,
        headcount: d.headcount,
        monthlySalary: d.contractedSalary,
      })),
      sources: {
        attendance: 'Attendance',
        timeOff: 'TimeOffRequest + TimeOffAllocation',
        department: 'Employee + Contract + Payslip totals',
      },
    };
  }

  /** Six months of net salary ending at the selected period. */
  private async monthlyTrend(employeeWhere: Prisma.EmployeeWhereInput, end: Date) {
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(end.getFullYear(), end.getMonth() - i, 1);
      const last = new Date(end.getFullYear(), end.getMonth() - i + 1, 0);
      months.push({
        label: start.toLocaleString('en-US', { month: 'short' }),
        start,
        end: last,
      });
    }

    const results = await Promise.all(
      months.map((m) =>
        this.prisma.payslip.aggregate({
          where: {
            periodStart: { gte: m.start },
            periodEnd: { lte: m.end },
            employee: employeeWhere,
          },
          _sum: { netAmount: true },
          _count: true,
        }),
      ),
    );

    return months.map((m, i) => ({
      month: m.label,
      net: Math.round(Number(results[i]._sum.netAmount ?? 0)),
      payslips: results[i]._count,
    }));
  }

  private resolvePeriod(period?: string) {
    const now = new Date();
    const [year, month] = period
      ? period.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1];
    return {
      start: new Date(year, (month ?? 1) - 1, 1),
      end: new Date(year, month ?? 1, 0, 23, 59, 59),
    };
  }

  private periodLabel(start: Date) {
    return start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
}
