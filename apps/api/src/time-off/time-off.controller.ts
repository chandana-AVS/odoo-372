import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { EmployeesService } from '../employees/employees.service';
import { TimeOffService } from './time-off.service';

const HR = [
  RoleName.HR_MANAGER,
  RoleName.HR_PAYROLL_USER,
  RoleName.HR_PAYROLL_MANAGER,
] as const;

@Controller('time-off')
export class TimeOffController {
  constructor(
    private readonly timeOff: TimeOffService,
    private readonly employees: EmployeesService,
  ) {}

  // ------------------------------------------------------------- types
  @Get('types')
  listTypes() {
    return this.timeOff.listTypes();
  }

  @Roles(...HR)
  @Post('types')
  createType(@Body() body: any) {
    return this.timeOff.createType(body);
  }

  @Roles(...HR)
  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body() body: any) {
    return this.timeOff.updateType(id, body);
  }

  // ------------------------------------------------------- allocations
  @Get('allocations')
  listAllocations(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.timeOff.listAllocations(user, query);
  }

  @Roles(...HR)
  @Post('allocations')
  createAllocation(@Body() body: any) {
    return this.timeOff.createAllocation(body);
  }

  @Roles(...HR)
  @Patch('allocations/:id')
  updateAllocation(@Param('id') id: string, @Body() body: any) {
    return this.timeOff.updateAllocation(id, body);
  }

  @Roles(...HR)
  @Post('allocations/:id/approve')
  approveAllocation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timeOff.approveAllocation(user, id);
  }

  @Roles(...HR)
  @Post('allocations/:id/refuse')
  refuseAllocation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timeOff.refuseAllocation(user, id);
  }

  // ---------------------------------------------------------- requests
  @Get('requests')
  listRequests(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.timeOff.listRequests(user, query);
  }

  @Get('requests/:id')
  findRequest(@Param('id') id: string) {
    return this.timeOff.findRequest(id);
  }

  /** Any employee may raise their own request. */
  @Post('requests')
  createRequest(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.timeOff.createRequest(user, body);
  }

  @Roles(...HR)
  @Post('requests/:id/approve')
  approveRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timeOff.approveRequest(user, id);
  }

  @Roles(...HR)
  @Post('requests/:id/refuse')
  refuseRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.timeOff.refuseRequest(user, id, reason);
  }

  @Post('requests/:id/cancel')
  cancelRequest(@Param('id') id: string) {
    return this.timeOff.cancelRequest(id);
  }

  // ---------------------------------------------------------- balances
  @Get('balances')
  balances(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId?: string) {
    return this.employees.balances(employeeId ?? user.employeeId ?? '');
  }
}
