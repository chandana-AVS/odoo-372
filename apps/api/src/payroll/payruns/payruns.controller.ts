import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { PayrunScope, PayrunsService } from './payruns.service';

@Controller('payruns')
@Roles(RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
export class PayrunsController {
  constructor(private readonly payruns: PayrunsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.payruns.findAll(query);
  }

  /**
   * Wizard step 2. A POST because the scope is a body, but it is a READ:
   * nothing is persisted here.
   */
  @Post('eligible-employees')
  eligible(@Body() scope: PayrunScope) {
    return this.payruns.eligibleEmployees(scope);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.payruns.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: PayrunScope & { employeeIds: string[]; name?: string },
  ) {
    return this.payruns.create(user, dto);
  }

  @Post(':id/compute')
  compute(@Param('id') id: string) {
    return this.payruns.compute(id);
  }

  @Post(':id/validate')
  validate(@Param('id') id: string) {
    return this.payruns.validate(id);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Post(':id/mark-paid')
  markPaid(@Param('id') id: string) {
    return this.payruns.markPaid(id);
  }

  // Emailing payslips out is restricted to payroll staff and admins.
  // (ADMIN bypasses every @Roles check in RolesGuard.)
  @Roles(RoleName.HR_PAYROLL_MANAGER, RoleName.HR_PAYROLL_USER)
  @Post(':id/send-payslips')
  send(@Param('id') id: string) {
    return this.payruns.sendPayslips(id);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.payruns.remove(id);
  }
}
