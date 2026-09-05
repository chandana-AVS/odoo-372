import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        roles: { include: { role: true } },
        employee: { include: { department: true, jobPosition: true } },
      },
    });

    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const roles = user.roles.map((ur) => ur.role.name);
    const payload = { sub: user.id, email: user.email, employeeId: user.employeeId, roles };

    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: '12h' }),
      refreshToken: await this.jwt.signAsync({ sub: user.id }, { expiresIn: '7d' }),
      user: this.publicUser(user, roles),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        employee: { include: { department: true, jobPosition: true } },
      },
    });
    return this.publicUser(
      user,
      user.roles.map((ur) => ur.role.name),
    );
  }

  /**
   * Headline counts for the login splash. Deliberately aggregate-only — this is
   * served unauthenticated, so it must never expose anything about a person.
   */
  async publicStats() {
    const [employees, salaryRules, payruns] = await Promise.all([
      this.prisma.employee.count({ where: { isActive: true } }),
      this.prisma.salaryRule.count(),
      this.prisma.payrun.count(),
    ]);
    return { employees, salaryRules, payruns };
  }

  static hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private publicUser(user: any, roles: string[]) {
    return {
      id: user.id,
      email: user.email,
      roles,
      employeeId: user.employeeId,
      employee: user.employee
        ? {
            id: user.employee.id,
            firstName: user.employee.firstName,
            lastName: user.employee.lastName,
            avatarUrl: user.employee.avatarUrl,
            department: user.employee.department?.name ?? null,
            jobPosition: user.employee.jobPosition?.name ?? null,
          }
        : null,
    };
  }
}
