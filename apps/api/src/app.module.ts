import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { ContractResolver } from './payroll/engine/contract-resolver';
import { PayslipBuilder } from './payroll/engine/payslip-builder';
import { WarningCollector } from './payroll/engine/warning-collector';
import { PayrunsController } from './payroll/payruns/payruns.controller';
import { PayrunsService } from './payroll/payruns/payruns.service';
import { PayslipsController } from './payroll/payslips/payslips.controller';
import { PayrollConfigController } from './payroll/structures/payroll-config.controller';
import { PayrollConfigService } from './payroll/structures/payroll-config.service';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulesController } from './schedules/schedules.controller';
import { SchedulesService } from './schedules/schedules.service';
import { MailService } from './shared/mail.service';
import { PdfService } from './shared/pdf.service';
import { TimeOffController } from './time-off/time-off.controller';
import { TimeOffService } from './time-off/time-off.service';
import { UsersController } from './users/users.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    UsersController,
    EmployeesController,
    ContractsController,
    SchedulesController,
    AttendanceController,
    TimeOffController,
    PayrollConfigController,
    PayrunsController,
    PayslipsController,
    DashboardController,
  ],
  providers: [
    // Every route is authenticated and role-checked unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },

    EmployeesService,
    ContractsService,
    SchedulesService,
    AttendanceService,
    TimeOffService,
    PayrollConfigService,
    PayrunsService,
    DashboardService,

    // Payroll engine
    ContractResolver,
    WarningCollector,
    PayslipBuilder,

    // Shared
    PdfService,
    MailService,
  ],
})
export class AppModule {}
