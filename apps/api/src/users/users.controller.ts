import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Admin-only user management (mockup section 0). */
@Controller()
@Roles(RoleName.ADMIN)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get('roles')
  roles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  @Get('users')
  findAll(@Query('q') q?: string, @Query('role') role?: string) {
    return this.prisma.user.findMany({
      where: {
        email: q ? { contains: q, mode: 'insensitive' } : undefined,
        roles: role ? { some: { role: { name: role as RoleName } } } : undefined,
      },
      include: {
        roles: { include: { role: true } },
        employee: { select: { id: true, firstName: true, lastName: true, code: true } },
      },
      orderBy: { email: 'asc' },
    });
  }

  @Post('users')
  async create(@Body() body: any) {
    const roleIds = await this.resolveRoles(body.roles ?? []);
    return this.prisma.user.create({
      data: {
        email: body.email.toLowerCase().trim(),
        passwordHash: await AuthService.hash(body.password ?? 'welcome123'),
        employeeId: body.employeeId || null,
        isActive: body.isActive ?? true,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
      include: { roles: { include: { role: true } }, employee: true },
    });
  }

  @Patch('users/:id')
  async update(
    @CurrentUser() current: AuthUser,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    // Mockup rule: "Users must not be able to assign or elevate their own roles."
    if (body.roles && id === current.id) {
      throw new BadRequestException('You cannot change your own roles.');
    }

    const data: any = {
      email: body.email?.toLowerCase().trim(),
      employeeId: body.employeeId === undefined ? undefined : body.employeeId || null,
      isActive: body.isActive,
    };
    if (body.password) data.passwordHash = await AuthService.hash(body.password);

    if (body.roles) {
      const roleIds = await this.resolveRoles(body.roles);
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      data.roles = { create: roleIds.map((roleId) => ({ roleId })) };
    }

    return this.prisma.user.update({
      where: { id },
      data,
      include: { roles: { include: { role: true } }, employee: true },
    });
  }

  @Delete('users/:id')
  async deactivate(@CurrentUser() current: AuthUser, @Param('id') id: string) {
    if (id === current.id) throw new BadRequestException('You cannot deactivate yourself.');
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  private async resolveRoles(names: string[]): Promise<string[]> {
    const roles = await this.prisma.role.findMany({
      where: { name: { in: names as RoleName[] } },
    });
    return roles.map((r) => r.id);
  }
}
