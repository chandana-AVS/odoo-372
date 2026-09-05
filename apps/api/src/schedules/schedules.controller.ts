import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators';
import { SchedulesService } from './schedules.service';

@Controller('working-schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  findAll() {
    return this.schedules.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schedules.findOne(id);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
  @Post()
  create(@Body() body: any) {
    return this.schedules.create(body);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.schedules.update(id, body);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schedules.remove(id);
  }
}
