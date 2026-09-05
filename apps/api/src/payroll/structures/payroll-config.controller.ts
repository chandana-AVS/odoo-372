import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators';
import { PayrollConfigService } from './payroll-config.service';

/**
 * RBAC (ARCHITECTURE §5): HR_PAYROLL_USER gets READ ONLY here.
 * Writes require HR_PAYROLL_MANAGER (or ADMIN, handled by the guard).
 */
@Controller()
@Roles(RoleName.HR_PAYROLL_USER, RoleName.HR_PAYROLL_MANAGER)
export class PayrollConfigController {
  constructor(private readonly config: PayrollConfigService) {}

  // -------------------------------------------------------- structures
  @Get('salary-structures')
  listStructures() {
    return this.config.listStructures();
  }

  @Get('salary-structures/:id')
  findStructure(@Param('id') id: string) {
    return this.config.findStructure(id);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Post('salary-structures')
  createStructure(@Body() body: any) {
    return this.config.createStructure(body);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Patch('salary-structures/:id')
  updateStructure(@Param('id') id: string, @Body() body: any) {
    return this.config.updateStructure(id, body);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Post('salary-structures/:id/reorder')
  reorder(@Param('id') id: string, @Body('order') order: { id: string; sequence: number }[]) {
    return this.config.reorderRules(id, order);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Delete('salary-structures/:id')
  removeStructure(@Param('id') id: string) {
    return this.config.removeStructure(id);
  }

  // ------------------------------------------------------------- rules
  @Get('salary-rules')
  listRules(@Query() query: any) {
    return this.config.listRules(query);
  }

  @Get('salary-rules/:id')
  findRule(@Param('id') id: string) {
    return this.config.findRule(id);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Post('salary-rules')
  createRule(@Body() body: any) {
    return this.config.createRule(body);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Patch('salary-rules/:id')
  updateRule(@Param('id') id: string, @Body() body: any) {
    return this.config.updateRule(id, body);
  }

  @Roles(RoleName.HR_PAYROLL_MANAGER)
  @Delete('salary-rules/:id')
  removeRule(@Param('id') id: string) {
    return this.config.removeRule(id);
  }
}
