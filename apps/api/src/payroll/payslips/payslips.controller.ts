import { Controller, ForbiddenException, Get, Param, Post, Query, Res } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser, canSeeAllRecords, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { PdfService } from '../../shared/pdf.service';
import { PayslipBuilder } from '../engine/payslip-builder';

@Controller('payslips')
export class PayslipsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: PayslipBuilder,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.prisma.payslip.findMany({
      where: {
        // An employee only ever sees their own payslips.
        employeeId: canSeeAllRecords(user)
          ? query.employeeId || undefined
          : user.employeeId ?? '__none__',
        payrunId: query.payrunId || undefined,
        state: query.state || undefined,
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
        payrun: { select: { id: true, name: true } },
        salaryStructure: { select: { name: true } },
      },
      orderBy: { periodStart: 'desc' },
    });
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
