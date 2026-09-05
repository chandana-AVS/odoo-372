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
