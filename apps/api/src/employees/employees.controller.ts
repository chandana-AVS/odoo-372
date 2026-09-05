import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { EmployeesService } from './employees.service';

@Controller()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('departments')
  departments() {
    return this.employees.departments();
  }

  @Get('job-positions')
  jobPositions() {
    return this.employees.jobPositions();
  }

  @Get('companies')
  companies() {
    return this.employees.companies();
  }

  @Get('employees')
  findAll(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.employees.findAll(user, query);
  }

  @Get('employees/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.findOne(user, id);
  }

  @Get('employees/:id/summary')
  summary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.summary(user, id);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
  @Post('employees')
  create(@Body() body: any) {
    return this.employees.create(body);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
  @Patch('employees/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.employees.update(id, body);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_MANAGER)
  @Delete('employees/:id')
  remove(@Param('id') id: string) {
    return this.employees.remove(id);
  }
}
