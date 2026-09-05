import { ForbiddenException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthUser } from './decorators';

/** Roles that may decide an ordinary employee's request. */
export const HR_APPROVER_ROLES: RoleName[] = [
  RoleName.HR_MANAGER,
  RoleName.HR_PAYROLL_USER,
  RoleName.HR_PAYROLL_MANAGER,
];

/** True when the person holds any HR role (ADMIN is handled separately). */
export function isHrStaff(roles: RoleName[]): boolean {
  return roles.some((role) => HR_APPROVER_ROLES.includes(role));
}

/**
 * Who may decide a request, given who raised it.
 *
 * Two rules, both about keeping the decision independent of the requester:
 *
 *   1. Nobody approves their own request — not even an admin.
 *   2. An HR member's own request escalates to ADMIN. HR peers cannot approve
 *      each other, because that is the control the escalation exists to create.
 *
 * Everyone else's requests are decided by any HR role, or by an admin.
 */
export function assertCanDecide(params: {
  /** The signed-in user making the decision. */
  decider: AuthUser;
  /** Employee the request belongs to. */
  requesterEmployeeId: string;
  /** Roles held by the requester, resolved from their user account. */
  requesterRoles: RoleName[];
  /** Wording for the error, e.g. "leave request" or "attendance request". */
  subject?: string;
}): void {
  const { decider, requesterEmployeeId, requesterRoles } = params;
  const subject = params.subject ?? 'request';

  // 1. Self-approval is never allowed.
  if (decider.employeeId && decider.employeeId === requesterEmployeeId) {
    throw new ForbiddenException(
      `You cannot approve your own ${subject}. It must be decided by someone else.`,
    );
  }

  const deciderIsAdmin = decider.roles.includes(RoleName.ADMIN);
  const requesterIsHr = isHrStaff(requesterRoles);

  // 2. HR staff raising their own request escalates to an admin.
  if (requesterIsHr && !deciderIsAdmin) {
    throw new ForbiddenException(
      `This ${subject} was raised by an HR user, so only an administrator can decide it.`,
    );
  }

  // Everyone else: any HR role, or an admin.
  if (!deciderIsAdmin && !isHrStaff(decider.roles)) {
    throw new ForbiddenException(`You are not permitted to decide this ${subject}.`);
  }
}

/**
 * Employee ids belonging to HR staff (any of the three HR roles).
 *
 * Used to keep HR-raised requests out of the HR review queues entirely: those
 * escalate to an admin, so showing them to HR peers who cannot act on them is
 * just noise — and implies an authority they do not have.
 */
export async function hrStaffEmployeeIds(prisma: {
  user: { findMany: (args: any) => Promise<any[]> };
}): Promise<string[]> {
  const accounts = await prisma.user.findMany({
    where: {
      employeeId: { not: null },
      roles: { some: { role: { name: { in: HR_APPROVER_ROLES } } } },
    },
    select: { employeeId: true },
  });
  return accounts.map((a) => a.employeeId).filter(Boolean) as string[];
}
