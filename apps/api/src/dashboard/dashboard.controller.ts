import { Controller, Get, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators';
import { DashboardFilters, DashboardService } from './dashboard.service';

@Controller('dashboard')
@Roles(
  RoleName.HR_MANAGER,
  RoleName.HR_PAYROLL_USER,
  RoleName.HR_PAYROLL_MANAGER,
)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  build(@Query() filters: DashboardFilters) {
    return this.dashboard.build(filters);
  }
}
