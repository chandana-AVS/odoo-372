import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateFormula } from '../engine/formula-sandbox';

@Injectable()
export class PayrollConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------- structures
  async listStructures() {
    const structures = await this.prisma.salaryStructure.findMany({
      include: {
        _count: { select: { rules: true, contracts: true } },
        company: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return structures.map((s) => ({
      ...s,
      ruleCount: s._count.rules,
      employeeCount: s._count.contracts,
    }));
  }

  findStructure(id: string) {
    return this.prisma.salaryStructure.findUniqueOrThrow({
      where: { id },
      include: {
        rules: { orderBy: { sequence: 'asc' } },
        _count: { select: { contracts: true } },
      },
    });
  }

  createStructure(data: any) {
    return this.prisma.salaryStructure.create({ data });
  }

  updateStructure(id: string, data: any) {
    return this.prisma.salaryStructure.update({ where: { id }, data });
  }

  removeStructure(id: string) {
    return this.prisma.salaryStructure.update({ where: { id }, data: { isActive: false } });
  }

  // ------------------------------------------------------------- rules
  listRules(query: { structureId?: string; category?: string }) {
    return this.prisma.salaryRule.findMany({
      where: {
        structureId: query.structureId || undefined,
        category: (query.category as any) || undefined,
      },
      include: { structure: { select: { id: true, name: true } } },
      orderBy: [{ structureId: 'asc' }, { sequence: 'asc' }],
    });
  }

  findRule(id: string) {
    return this.prisma.salaryRule.findUniqueOrThrow({
      where: { id },
      include: { structure: true },
    });
  }

  createRule(data: any) {
    this.validateRule(data);
    return this.prisma.salaryRule.create({ data: this.ruleInput(data) });
  }

  updateRule(id: string, data: any) {
    this.validateRule(data);
    return this.prisma.salaryRule.update({ where: { id }, data: this.ruleInput(data) });
  }

  removeRule(id: string) {
    return this.prisma.salaryRule.delete({ where: { id } });
  }

  /** Re-order rules from the structure form (drag to reorder). */
  async reorderRules(structureId: string, order: { id: string; sequence: number }[]) {
    await this.prisma.$transaction(
      order.map((item) =>
        this.prisma.salaryRule.update({
          where: { id: item.id },
          data: { sequence: item.sequence },
        }),
      ),
    );
    return this.findStructure(structureId);
  }

  private ruleInput(data: any): any {
    return {
      name: data.name,
      code: data.code?.toUpperCase(),
      sequence: data.sequence !== undefined ? Number(data.sequence) : undefined,
      category: data.category,
      computationType: data.computationType,
      amountFixed:
        data.amountFixed === null || data.amountFixed === undefined || data.amountFixed === ''
          ? null
          : new Prisma.Decimal(data.amountFixed),
      percentage:
        data.percentage === null || data.percentage === undefined || data.percentage === ''
          ? null
          : new Prisma.Decimal(data.percentage),
      percentageBase: data.percentageBase || null,
      formula: data.formula || null,
      condition: data.condition || null,
      quantity: data.quantity !== undefined ? new Prisma.Decimal(data.quantity) : undefined,
      isActive: data.isActive,
      structureId: data.structureId,
    };
  }

  /** Fail fast on a rule that could never compute. */
  private validateRule(data: any) {
    if (data.computationType === 'FIXED' && (data.amountFixed === null || data.amountFixed === '')) {
      throw new BadRequestException('A Fixed Amount rule needs an amount.');
    }
    if (data.computationType === 'PERCENTAGE') {
      if (data.percentage === null || data.percentage === '') {
        throw new BadRequestException('A Percentage rule needs a percentage.');
      }
      if (!data.percentageBase) {
        throw new BadRequestException('A Percentage rule needs a base (wage, basic, gross…).');
      }
    }
    if (data.computationType === 'FORMULA') {
      if (!data.formula?.trim()) {
        throw new BadRequestException('A Formula rule needs an expression.');
      }
      // Parse it now so a broken formula is rejected at save time, not payrun time.
      try {
        evaluateFormula(data.formula, {
          rules: {},
          categories: {},
          wage: 0,
          worked_days: 0,
          worked_hours: 0,
          expected_days: 1,
          expected_hours: 1,
          leave_days: 0,
          unpaid_leave_days: 0,
          overtime_hours: 0,
        });
      } catch (error: any) {
        throw new BadRequestException(error.message);
      }
    }
  }
}
