import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators';
import { ContractsService } from './contracts.service';

@Controller('contracts')
@Roles(
  RoleName.HR_MANAGER,
  RoleName.HR_PAYROLL_USER,
  RoleName.HR_PAYROLL_MANAGER,
)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.contracts.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contracts.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.contracts.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.contracts.update(id, body);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.contracts.activate(id);
  }

  @Roles(RoleName.HR_MANAGER, RoleName.HR_PAYROLL_MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contracts.remove(id);
  }
}
