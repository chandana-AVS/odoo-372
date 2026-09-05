import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { AuthUser, ROLES_KEY } from '../decorators';

/**
 * Coarse module-level access. Record-level scoping (an EMPLOYEE only ever sees
 * their own rows) is applied inside each service.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser;
    if (!user) throw new ForbiddenException('Not authenticated');

    // ADMIN has full access to all modules and models.
    if (user.roles.includes(RoleName.ADMIN)) return true;

    const allowed = required.some((role) => user.roles.includes(role));
    if (!allowed) {
      throw new ForbiddenException(
        `Requires one of: ${required.join(', ')}. You have: ${user.roles.join(', ') || 'none'}.`,
      );
    }
    return true;
  }
}
