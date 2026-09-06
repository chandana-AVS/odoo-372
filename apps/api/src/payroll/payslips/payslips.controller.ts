import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser, canSeeAllRecords, CurrentUser, Roles } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../shared/mail.service';
import { PdfService } from '../../shared/pdf.service';
import { PayslipBuilder } from '../engine/payslip-builder';

@Controller('payslips')
export class PayslipsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: PayslipBuilder,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
  ) {}

  /** Rows per page — a year of payruns at 200 staff is thousands of rows. */
  private static readonly PAGE_SIZE = 50;

  /**
   * One page of payslips, plus the total so the UI can render a pager.
   */
  @Get()
  async findAll(@CurrentUser() user: AuthUser, @Query() query: any) {
    const where = {
      // An employee only ever sees their own payslips.
      employeeId: canSeeAllRecords(user)
        ? query.employeeId || undefined
        : user.employeeId ?? '__none__',
      payrunId: query.payrunId || undefined,
      state: query.state || undefined,
    };

    const pageSize = Math.min(
      Math.max(Number(query.pageSize) || PayslipsController.PAGE_SIZE, 1),
      200,
    );
    const page = Math.max(Number(query.page) || 1, 1);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payslip.count({ where }),
      this.prisma.payslip.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              code: true,
              gender: true,
              avatarUrl: true,
            },
          },
          payrun: { select: { id: true, name: true } },
          salaryStructure: { select: { name: true } },
        },
        orderBy: { periodStart: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { rows, total, page, pageSize, pageCount: Math.max(Math.ceil(total / pageSize), 1) };
  }

  /**
   * Email an arbitrary set of payslips, across any payruns.
   *
   * The payrun-level send covers a whole batch; this exists for the cases that
   * one misses — a late joiner, a recomputed slip, or a handful of people who
   * were skipped for a missing email and have since been fixed.
   */
  @Roles(RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
  @Post('send')
  async sendMany(@Body() body: { ids?: string[] }) {
    const ids = body?.ids ?? [];
    if (!ids.length) throw new BadRequestException('Select at least one payslip.');
    if (ids.length > 200) {
      throw new BadRequestException('Send at most 200 payslips at a time.');
    }

    const payslips = await this.prisma.payslip.findMany({
      where: { id: { in: ids } },
      include: { employee: true, payrun: { select: { name: true } } },
    });

    const sent: string[] = [];
    const skipped: { employee: string; reason: string }[] = [];

    for (const payslip of payslips) {
      const name = `${payslip.employee.firstName} ${payslip.employee.lastName}`;

      if (!payslip.employee.workEmail) {
        skipped.push({ employee: name, reason: 'No work email' });
        continue;
      }
      // An uncomputed payslip has no lines, so the PDF would be meaningless.
      if (payslip.state === 'DRAFT') {
        skipped.push({ employee: name, reason: 'Not computed yet' });
        continue;
      }

      try {
        const pdf = await this.pdf.renderPayslip(payslip.id);
        await this.mail.sendPayslip({
          to: payslip.employee.workEmail,
          employeeName: name,
          period: payslip.payrun?.name ?? payslip.number,
          netAmount: Number(payslip.netAmount),
          pdf,
          fileName: `${payslip.number.replace(/\//g, '-')}.pdf`,
        });
        await this.prisma.payslip.update({
          where: { id: payslip.id },
          data: { sentAt: new Date() },
        });
        sent.push(payslip.employee.workEmail);
      } catch (error) {
        // One bad address must not abort the rest of the batch.
        skipped.push({ employee: name, reason: (error as Error).message });
      }
    }

    return { sent: sent.length, skipped, requested: ids.length };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const payslip = await this.prisma.payslip.findUniqueOrThrow({
      where: { id },
      include: {
        employee: { include: { department: true, jobPosition: true } },
        contract: true,
        payrun: true,
        salaryStructure: true,
        lines: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!canSeeAllRecords(user) && payslip.employeeId !== user.employeeId) {
      throw new ForbiddenException('You can only view your own payslip.');
    }
    return payslip;
  }

  @Post(':id/compute')
  async compute(@Param('id') id: string) {
    const payslip = await this.prisma.payslip.findUniqueOrThrow({ where: { id } });
    return this.builder.build({
      employeeId: payslip.employeeId,
      payrunId: payslip.payrunId,
      salaryStructureId: payslip.salaryStructureId,
      periodStart: payslip.periodStart,
      periodEnd: payslip.periodEnd,
    });
  }

  /** Print Payslip → PDF. */
  @Get(':id/pdf')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const payslip = await this.prisma.payslip.findUniqueOrThrow({ where: { id } });
    if (!canSeeAllRecords(user) && payslip.employeeId !== user.employeeId) {
      throw new ForbiddenException('You can only download your own payslip.');
    }
    const buffer = await this.pdf.renderPayslip(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${payslip.number.replace(/\//g, '-')}.pdf"`,
    );
    res.end(buffer);
  }
}
