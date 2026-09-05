import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.attendance.findAll(user, query);
  }

  /** Widget state — red/green + elapsed time. */
  @Get('current')
  current(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId?: string) {
    return this.attendance.current(user, employeeId);
  }

  /** The signed-in employee's own explanation requests. */
  @Get('requests')
  listRequests(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.attendance.listRequests(user, query);
  }

  /** Raise the reason for a day that was not a standard 8 hours. */
  @Post('requests')
  submitRequest(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.attendance.submitRequest(user, body);
  }

  /** What approved overtime on this day would be worth. */
  @Get('requests/quote/:attendanceId')
  quote(@Param('attendanceId') attendanceId: string) {
    return this.attendance.quoteFor(attendanceId);
  }

  /**
   * HR decision on a request. Approving extra time prices and stores the pay.
   * All three HR roles may decide; ADMIN bypasses the check entirely.
   */
  @Roles(
    RoleName.HR_MANAGER,
    RoleName.HR_PAYROLL_USER,
    RoleName.HR_PAYROLL_MANAGER,
  )
  @Patch('requests/:id')
  decideRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.attendance.decideRequest(user, id, body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.attendance.findOne(id);
  }

  @Post('check-in')
  checkIn(@CurrentUser() user: AuthUser, @Body('employeeId') employeeId?: string) {
    return this.attendance.checkIn(user, employeeId);
  }

  @Post('check-out')
  checkOut(@CurrentUser() user: AuthUser, @Body('employeeId') employeeId?: string) {
    return this.attendance.checkOut(user, employeeId);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
  @Post()
  create(@Body() body: any) {
    return this.attendance.create(body);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
  @Patch(':id')
  correct(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.attendance.correct(user, id, body);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.attendance.remove(id);
  }
}
