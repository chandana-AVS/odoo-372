import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { RoleName } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'isPublic';

/** Restrict a route to one or more roles (ARCHITECTURE §5 RBAC matrix). */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

/** Opt a route out of JWT authentication (login, health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export interface AuthUser {
  id: string;
  email: string;
  employeeId: string | null;
  roles: RoleName[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser;
    return data ? user?.[data] : user;
  },
);

/** True when the user may see records other than their own. */
export function canSeeAllRecords(user: AuthUser): boolean {
  return user.roles.some((r) => r !== RoleName.EMPLOYEE);
}
