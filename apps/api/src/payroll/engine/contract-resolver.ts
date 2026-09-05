import { Injectable } from '@nestjs/common';
import { Contract, ContractStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollWarning } from './types';

export interface ContractResolution {
  contract: Contract | null;
  warnings: PayrollWarning[];
}

/**
 * Invariant I1 — payroll must use the contract that applies to the payroll
 * period, and an employee must never have two RUNNING contracts overlapping
 * the same period.
 */
@Injectable()
export class ContractResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ContractResolution> {
    const candidates = await this.prisma.contract.findMany({
      where: {
        employeeId,
        status: ContractStatus.RUNNING,
        startDate: { lte: periodEnd },
        OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
      },
      orderBy: { startDate: 'desc' },
    });

    if (candidates.length === 0) {
      return {
        contract: null,
        warnings: [
          {
            code: 'NO_ACTIVE_CONTRACT',
            severity: 'blocking',
            employeeId,
            message: 'No running contract covers this payroll period.',
          },
        ],
      };
    }

    if (candidates.length > 1) {
      return {
        contract: candidates[0],
        warnings: [
          {
            code: 'MULTIPLE_ACTIVE_CONTRACTS',
            severity: 'blocking',
            employeeId,
            message: `${candidates.length} running contracts overlap this period (${candidates
              .map((c) => c.reference)
              .join(', ')}). Exactly one is required.`,
          },
        ],
      };
    }

    return { contract: candidates[0], warnings: [] };
  }

  /**
   * Guard used when a contract is created or activated. Throws-free: returns
   * the conflicting contracts so the caller can decide the HTTP status.
   */
  async findOverlapping(
    employeeId: string,
    startDate: Date,
    endDate: Date | null,
    excludeContractId?: string,
  ): Promise<Contract[]> {
    return this.prisma.contract.findMany({
      where: {
        employeeId,
        status: ContractStatus.RUNNING,
        id: excludeContractId ? { not: excludeContractId } : undefined,
        startDate: endDate ? { lte: endDate } : undefined,
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
    });
  }
}
