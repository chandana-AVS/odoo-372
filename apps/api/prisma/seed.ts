/* eslint-disable no-console */
import {
  AllocationState,
  AttendanceStatus,
  ComputationType,
  ContractStatus,
  EmployeeType,
  PayrunState,
  PayslipState,
  PrismaClient,
  RoleName,
  RuleCategory,
  TimeOffState,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: 'Human Resources', code: 'HR' },
  { name: 'Sales', code: 'SALES' },
  { name: 'Support', code: 'SUP' },
  { name: 'Finance', code: 'FIN' },
  { name: 'Information Technology', code: 'IT' },
];

const POSITIONS = [
  'Payroll Specialist',
  'HR Business Partner',
  'Account Executive',
  'Support Engineer',
  'Financial Analyst',
  'Software Engineer',
  'Engineering Manager',
  'Recruiter',
];

const PEOPLE = [
  ['Aarav', 'Mehta', 'FIN', 'Payroll Specialist', 85000, EmployeeType.FULL_TIME],
  ['Sara', 'Khan', 'HR', 'HR Business Partner', 92000, EmployeeType.FULL_TIME],
  ['Anita', 'Oliver', 'SALES', 'Account Executive', 78000, EmployeeType.FULL_TIME],
  ['Audrey', 'Peterson', 'SALES', 'Account Executive', 74000, EmployeeType.FULL_TIME],
  ['Billy', 'Kyle', 'SUP', 'Support Engineer', 61000, EmployeeType.FULL_TIME],
  ['Eli', 'Lambert', 'IT', 'Software Engineer', 96000, EmployeeType.FULL_TIME],
  ['Paul', 'Williams', 'IT', 'Software Engineer', 88000, EmployeeType.FULL_TIME],
  ['Meera', 'Nair', 'FIN', 'Financial Analyst', 71000, EmployeeType.FULL_TIME],
  ['Rohit', 'Sharma', 'IT', 'Engineering Manager', 145000, EmployeeType.FULL_TIME],
  ['Divya', 'Patel', 'HR', 'Recruiter', 58000, EmployeeType.FULL_TIME],
  ['Karan', 'Singh', 'SUP', 'Support Engineer', 56000, EmployeeType.FULL_TIME],
  ['Neha', 'Gupta', 'SALES', 'Account Executive', 69000, EmployeeType.FULL_TIME],
  ['Arjun', 'Reddy', 'IT', 'Software Engineer', 91000, EmployeeType.FULL_TIME],
  ['Priya', 'Menon', 'FIN', 'Financial Analyst', 67000, EmployeeType.FULL_TIME],
  ['Vikram', 'Rao', 'SUP', 'Support Engineer', 59000, EmployeeType.CONTRACT],
  ['Ishita', 'Bose', 'HR', 'Recruiter', 54000, EmployeeType.PART_TIME],
  ['Sanjay', 'Kulkarni', 'SALES', 'Account Executive', 72000, EmployeeType.FULL_TIME],
  ['Ananya', 'Iyer', 'IT', 'Software Engineer', 84000, EmployeeType.FULL_TIME],
  ['Rahul', 'Verma', 'FIN', 'Financial Analyst', 64000, EmployeeType.CONTRACT],
  ['Tanya', 'Desai', 'SUP', 'Support Engineer', 57000, EmployeeType.FULL_TIME],
  ['Manish', 'Joshi', 'IT', 'Software Engineer', 79000, EmployeeType.FULL_TIME],
  ['Kavya', 'Pillai', 'SALES', 'Account Executive', 66000, EmployeeType.INTERN],
] as const;

/**
 * Headcount for the generated org. The 22 people above are hand-written
 * (managers, the missing-bank-account cases and the contract-history demo all
 * reference them by name); everyone beyond that is generated deterministically
 * so the dataset is large but still reproducible across re-seeds.
 */
const HEADCOUNT = Number(process.env.SEED_HEADCOUNT ?? 200);

const GEN_FIRST = [
  'Aditya', 'Aisha', 'Akash', 'Amrita', 'Ananth', 'Bhavna', 'Chirag', 'Deepa',
  'Dhruv', 'Esha', 'Farhan', 'Gaurav', 'Geeta', 'Harsh', 'Indira', 'Jatin',
  'Jyoti', 'Kabir', 'Lakshmi', 'Mohan', 'Nikhil', 'Nisha', 'Omkar', 'Pooja',
  'Rajat', 'Ritu', 'Sameer', 'Shreya', 'Tarun', 'Uma', 'Varun', 'Yash',
];
const GEN_LAST = [
  'Agarwal', 'Bhatt', 'Chopra', 'Dutta', 'Ghosh', 'Hegde', 'Jain', 'Kapoor',
  'Malhotra', 'Nadkarni', 'Prasad', 'Raman', 'Saxena', 'Trivedi', 'Vaidya', 'Warrier',
];

/** [deptCode, position, baseWage] — wage varies per person around the base. */
const GEN_ROLES: [string, string, number][] = [
  ['IT', 'Software Engineer', 88000],
  ['IT', 'Engineering Manager', 148000],
  ['SALES', 'Account Executive', 72000],
  ['SUP', 'Support Engineer', 58000],
  ['FIN', 'Financial Analyst', 68000],
  ['FIN', 'Payroll Specialist', 82000],
  ['HR', 'Recruiter', 56000],
  ['HR', 'HR Business Partner', 90000],
];

/** Deterministic generated staff, appended after the hand-written PEOPLE. */
const GENERATED = Array.from({ length: Math.max(0, HEADCOUNT - PEOPLE.length) }, (_, n) => {
  const i = n + PEOPLE.length;
  const [dept, position, base] = GEN_ROLES[i % GEN_ROLES.length];
  // Every 13th is a contractor, every 17th part-time, every 29th an intern.
  const type =
    i % 29 === 0
      ? EmployeeType.INTERN
      : i % 17 === 0
        ? EmployeeType.PART_TIME
        : i % 13 === 0
          ? EmployeeType.CONTRACT
          : EmployeeType.FULL_TIME;
  // Spread wages ±12% of the role base, in round thousands.
  const wage = Math.round((base * (0.88 + ((i * 37) % 25) / 100)) / 1000) * 1000;
  // First name cycles every 32; advance the surname one step per completed
  // cycle so the PAIR is unique for 32 x 16 = 512 people. Indexing both by `i`
  // directly would repeat the same pair every 32 rows.
  const firstIdx = i % GEN_FIRST.length;
  const cycle = Math.floor(i / GEN_FIRST.length);
  const lastIdx = (firstIdx + cycle) % GEN_LAST.length;
  return [
    GEN_FIRST[firstIdx],
    GEN_LAST[lastIdx],
    dept,
    position,
    wage,
    type,
  ] as const;
});

/**
 * Real people with fixed work emails. Their address must survive re-seeding, so
 * it is pinned here rather than derived from the name like everyone else.
 */
const NAMED: {
  firstName: string;
  lastName: string;
  email: string;
  dept: string;
  position: string;
  wage: number;
  type: EmployeeType;
}[] = [
  {
    firstName: 'Chandana',
    lastName: 'Avula',
    email: 'chandana270406@gmail.com',
    dept: 'HR',
    position: 'HR Business Partner',
    wage: 94000,
    type: EmployeeType.FULL_TIME,
  },
  {
    firstName: 'Vagdivi',
    lastName: 'Naripinni',
    email: 'vagdivinaripinni20@gmail.com',
    dept: 'FIN',
    position: 'Financial Analyst',
    wage: 78000,
    type: EmployeeType.FULL_TIME,
  },
  {
    firstName: 'Rohit',
    lastName: 'Vidyasagar',
    email: 'rohitsairamvidyasagar@gmail.com',
    dept: 'IT',
    position: 'Software Engineer',
    wage: 105000,
    type: EmployeeType.FULL_TIME,
  },
];

/** The full roster the seed actually walks. */
const ROSTER = [
  ...PEOPLE,
  ...GENERATED,
  ...NAMED.map(
    (n) => [n.firstName, n.lastName, n.dept, n.position, n.wage, n.type] as const,
  ),
];

/** Pinned address for a roster name, when one exists. */
const pinnedEmail = (firstName: string, lastName: string) =>
  NAMED.find((n) => n.firstName === firstName && n.lastName === lastName)?.email;

async function main() {
  console.log('Resetting…');
  // Order matters — children first.
  await prisma.payslipLine.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.payrun.deleteMany();
  await prisma.timeOffRequest.deleteMany();
  await prisma.timeOffAllocation.deleteMany();
  await prisma.timeOffType.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.salaryRule.deleteMany();
  await prisma.salaryStructure.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.scheduleLine.deleteMany();
  await prisma.workingSchedule.deleteMany();
  await prisma.jobPosition.deleteMany();
  await prisma.department.deleteMany();
  await prisma.role.deleteMany();
  await prisma.company.deleteMany();

  // ------------------------------------------------------------- company
  const company = await prisma.company.create({
    data: { name: 'OXP Pvt Ltd', currency: 'INR' },
  });

  // --------------------------------------------------------------- roles
  const roles = await Promise.all(
    Object.values(RoleName).map((name) =>
      prisma.role.create({ data: { name, description: name.replace(/_/g, ' ') } }),
    ),
  );
  const roleId = (name: RoleName) => roles.find((r) => r.name === name)!.id;

  // --------------------------------------------------------- departments
  const departments = await Promise.all(
    DEPARTMENTS.map((d) => prisma.department.create({ data: { ...d, companyId: company.id } })),
  );
  const deptId = (code: string) => departments.find((d) => d.code === code)!.id;

  const positions = await Promise.all(
    POSITIONS.map((name) => prisma.jobPosition.create({ data: { name } })),
  );
  const posId = (name: string) => positions.find((p) => p.name === name)!.id;

  // ----------------------------------------------------------- schedules
  const fullTime = await prisma.workingSchedule.create({
    data: {
      name: '40 Hours / Week',
      calendarType: 'FULL_TIME',
      companyId: company.id,
      lines: {
        create: [0, 1, 2, 3, 4].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '09:00',
          endTime: '18:00',
          breakMinutes: 60,
        })),
      },
    },
  });

  // Second day shift — the 10-6 crowd.
  const dayLate = await prisma.workingSchedule.create({
    data: {
      name: 'Day Shift (10-6)',
      calendarType: 'FULL_TIME',
      companyId: company.id,
      lines: {
        create: [0, 1, 2, 3, 4].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '10:00',
          endTime: '18:00',
          breakMinutes: 60,
        })),
      },
    },
  });

  // Night shift runs 20:00 -> 04:00, so it crosses midnight. The end time is
  // stored as the clock time on the FOLLOWING day; attendance accounts for the
  // rollover when it computes worked hours.
  const nightShift = await prisma.workingSchedule.create({
    data: {
      name: 'Night Shift (8pm-4am)',
      calendarType: 'FULL_TIME',
      companyId: company.id,
      lines: {
        create: [0, 1, 2, 3, 4].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '20:00',
          endTime: '04:00',
          breakMinutes: 60,
        })),
      },
    },
  });

  const partTime = await prisma.workingSchedule.create({
    data: {
      name: '20 Hours / Week',
      calendarType: 'PART_TIME',
      companyId: company.id,
      lines: {
        create: [0, 1, 2, 3, 4].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '09:00',
          endTime: '13:00',
          breakMinutes: 0,
        })),
      },
    },
  });

  // ---------------------------------------- salary structure + rules (I2)
  const regular = await prisma.salaryStructure.create({
    data: { name: 'Regular Salary', code: 'REGULAR', companyId: company.id },
  });

  await prisma.salaryRule.createMany({
    data: [
      {
        structureId: regular.id,
        name: 'Basic Salary',
        code: 'BASIC',
        sequence: 1,
        category: RuleCategory.BASIC,
        computationType: ComputationType.PERCENTAGE,
        percentage: 50,
        percentageBase: 'CONTRACT_WAGE',
      },
      {
        structureId: regular.id,
        name: 'House Rent Allowance',
        code: 'HRA',
        sequence: 10,
        category: RuleCategory.ALLOWANCE,
        computationType: ComputationType.PERCENTAGE,
        percentage: 40,
        percentageBase: 'BASIC',
      },
      {
        structureId: regular.id,
        name: 'Standard Allowance',
        code: 'STD',
        sequence: 20,
        category: RuleCategory.ALLOWANCE,
        computationType: ComputationType.FIXED,
        amountFixed: 10000,
      },
      {
        structureId: regular.id,
        name: 'Gross Salary',
        code: 'GROSS',
        sequence: 30,
        category: RuleCategory.GROSS,
        computationType: ComputationType.FORMULA,
        formula: "result = categories['BASIC'] + categories['ALLOWANCE']",
      },
      {
        structureId: regular.id,
        name: 'Provident Fund',
        code: 'PF',
        sequence: 40,
        category: RuleCategory.DEDUCTION,
        computationType: ComputationType.PERCENTAGE,
        percentage: 6,
        percentageBase: 'BASIC',
      },
      {
        structureId: regular.id,
        name: 'Professional Tax',
        code: 'PT',
        sequence: 45,
        category: RuleCategory.DEDUCTION,
        computationType: ComputationType.FIXED,
        amountFixed: 2000,
      },
      {
        structureId: regular.id,
        name: 'Net Salary',
        code: 'NET',
        sequence: 50,
        category: RuleCategory.NET,
        computationType: ComputationType.FORMULA,
        formula: "result = rules['GROSS'] + categories['DEDUCTION']",
      },
    ],
  });

  // A second structure to prove structures are selectable, not hardcoded.
  const intern = await prisma.salaryStructure.create({
    data: {
      name: 'Intern Stipend',
      code: 'INTERN',
      companyId: company.id,
      rules: {
        create: [
          {
            name: 'Stipend',
            code: 'BASIC',
            sequence: 1,
            category: RuleCategory.BASIC,
            computationType: ComputationType.PERCENTAGE,
            percentage: 100,
            percentageBase: 'CONTRACT_WAGE',
          },
          {
            name: 'Net Salary',
            code: 'NET',
            sequence: 50,
            category: RuleCategory.NET,
            computationType: ComputationType.FORMULA,
            formula: "result = categories['BASIC']",
          },
        ],
      },
    },
  });

  // ----------------------------------------------------------- employees
  type SeededEmployee = Awaited<ReturnType<typeof prisma.employee.create>> & {
    wage: number;
    type: EmployeeType;
  };
  const employees: SeededEmployee[] = [];
  for (const [i, person] of ROSTER.entries()) {
    const [firstName, lastName, dept, position, wage, type] = person;
    const employee = await prisma.employee.create({
      data: {
        code: `EMP${String(i + 1).padStart(4, '0')}`,
        firstName,
        lastName,
        workEmail:
          pinnedEmail(firstName, lastName) ??
          `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${String(
            i + 1,
          ).padStart(4, '0')}@oxp.com`,
        phone: `+91 98${String(10000000 + i * 137).slice(0, 8)}`,
        workLocation: ['Mumbai', 'Bengaluru', 'Pune'][i % 3],
        employeeType: type,
        companyId: company.id,
        departmentId: deptId(dept),
        jobPositionId: posId(position),
        // Part-timers keep the short day; everyone else is spread across the
        // three shift patterns (9-5, 10-6, and the 8pm-4am night shift).
        workingScheduleId:
          type === EmployeeType.PART_TIME
            ? partTime.id
            : i % 5 === 3
              ? nightShift.id
              : i % 5 === 1
                ? dayLate.id
                : fullTime.id,
        // Two employees deliberately have no bank account — this drives the
        // MISSING_BANK_ACCOUNT warning demoed on the payrun screen.
        bankAccount: i === 4 || i === 11 ? null : `IN${String(6011000000 + i * 7919)}`,
      },
    });
    employees.push({ ...employee, wage, type });
  }

  // ------------------------------------------------------------- managers
  // Two managers per department. Without an explicit flag the manager dropdown
  // would offer all 200 staff, which is unusable.
  const MANAGERS_PER_DEPARTMENT = 2;
  /** The hr.manager demo login is linked to this person. */
  const hrLead = employees.find((e) => e.firstName === 'Sara')!;
  const managersByDept = new Map<string, SeededEmployee[]>();

  for (const department of departments) {
    const inDept = employees.filter((e) => e.departmentId === department.id);
    if (!inDept.length) continue;

    // Pick the best-paid people — a reasonable proxy for seniority.
    const leads = [...inDept]
      .sort((a, b) => b.wage - a.wage)
      .slice(0, MANAGERS_PER_DEPARTMENT);
    managersByDept.set(department.id, leads);

    await prisma.employee.updateMany({
      where: { id: { in: leads.map((l) => l.id) } },
      data: { isManager: true },
    });

    // Everyone else in the department reports to the first lead; the second
    // lead reports to the first, so the chain has no cycle.
    const reports = inDept.filter((e) => !leads.some((l) => l.id === e.id));
    await prisma.employee.updateMany({
      where: { id: { in: reports.map((r) => r.id) } },
      data: { managerId: leads[0].id },
    });
    if (leads[1]) {
      await prisma.employee.update({
        where: { id: leads[1].id },
        data: { managerId: leads[0].id },
      });
    }
  }

  // ----------------------------------------------------------- contracts
  const year = new Date().getFullYear();
  for (const [i, employee] of employees.entries()) {
    const structureId = employee.type === EmployeeType.INTERN ? intern.id : regular.id;

    // Aarav gets a superseded contract so the demo can show contract history
    // and prove payroll picks the period-valid one (invariant I1).
    if (i === 0) {
      await prisma.contract.create({
        data: {
          reference: `CON/${year - 1}/0001`,
          employeeId: employee.id,
          startDate: new Date(year - 1, 0, 1),
          endDate: new Date(year - 1, 11, 31),
          wage: 68000,
          status: ContractStatus.EXPIRED,
          departmentId: employee.departmentId,
          jobPositionId: employee.jobPositionId,
          workingScheduleId: fullTime.id,
          salaryStructureId: regular.id,
          notes: 'Superseded by the current running contract.',
        },
      });
    }

    await prisma.contract.create({
      data: {
        reference: `CON/${year}/${String(i + 1).padStart(4, '0')}`,
        employeeId: employee.id,
        startDate: new Date(year, i % 8, 1),
        endDate: null,
        wage: employee.wage,
        status: ContractStatus.RUNNING,
        departmentId: employee.departmentId,
        jobPositionId: employee.jobPositionId,
        workingScheduleId: employee.workingScheduleId,
        salaryStructureId: structureId,
        notes: 'This running contract is the source for payroll calculation.',
      },
    });
  }

  // --------------------------------------------------------------- users
  const password = await bcrypt.hash('password123', 10);
  const accounts: [string, RoleName[], string | null][] = [
    ['admin@oxp.com', [RoleName.ADMIN], null],
    ['payroll.manager@oxp.com', [RoleName.HR_PAYROLL_MANAGER], employees[0].id],
    ['payroll.user@oxp.com', [RoleName.HR_PAYROLL_USER], employees[7].id],
    ['hr.manager@oxp.com', [RoleName.HR_MANAGER], hrLead.id],
    ['employee@oxp.com', [RoleName.EMPLOYEE], employees[2].id],
  ];

  for (const [email, names, employeeId] of accounts) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: password,
        employeeId,
        roles: { create: names.map((n) => ({ roleId: roleId(n) })) },
      },
    });
  }

  // ---------------------------------------------------------- attendance
  // At 200 staff a 90-day window is ~13k rows, which makes the attendance list
  // sluggish. Default to 30 days and let a bigger history be asked for.
  const attendanceDays = Number(process.env.SEED_ATTENDANCE_DAYS ?? 30);
  console.log(`Generating ${attendanceDays} days of attendance…`);
  const today = new Date();
  const attendanceRows: any[] = [];

  /**
   * Roster times per schedule. The night shift ends at 04:00 the NEXT day, so
   * its span is measured across midnight rather than as a negative interval.
   */
  const SHIFTS = [fullTime, dayLate, nightShift, partTime].map((schedule) => {
    const [start, end] = (() => {
      switch (schedule.id) {
        case dayLate.id:
          return ['10:00', '18:00'];
        case nightShift.id:
          return ['20:00', '04:00'];
        case partTime.id:
          return ['09:00', '13:00'];
        default:
          return ['09:00', '18:00'];
      }
    })();
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let spanMinutes = eh * 60 + em - (sh * 60 + sm);
    if (spanMinutes <= 0) spanMinutes += 24 * 60; // crosses midnight
    const breakMinutes = schedule.id === partTime.id ? 0 : 60;
    return {
      id: schedule.id,
      startHour: sh,
      startMinute: sm,
      spanMinutes: spanMinutes - breakMinutes,
      breakMinutes,
    };
  });
  const shiftFor = (scheduleId: string | null) =>
    SHIFTS.find((s) => s.id === scheduleId) ?? SHIFTS[0];

  for (const employee of employees) {
    for (let dayOffset = attendanceDays; dayOffset >= 0; dayOffset--) {
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      const weekday = date.getDay();
      // Anchor the day at UTC midnight. setHours(0,0,0,0) would use local time,
      // which in IST stores as 18:30 the PREVIOUS day and pushes every row into
      // the wrong bucket.
      date.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      date.setUTCHours(0, 0, 0, 0);
      if (weekday === 0 || weekday === 6) continue;

      // Deterministic pseudo-randomness so demos are reproducible.
      const seed =
        (employee.code.charCodeAt(3) * 31 +
          employee.code.charCodeAt(6) * 13 +
          dayOffset * 17) %
        100;
      if (seed < 4) continue; // absent / on leave

      const late = seed >= 88;
      const overtime = seed >= 94;
      const missingCheckout = seed === 50;

      // Times come from the employee's OWN shift, per day — not one fixed
      // clock time for the whole company.
      const shift = shiftFor(employee.workingScheduleId);

      // Arrive a few minutes either side of the rostered start; late arrivals
      // land ~40 minutes in.
      const checkIn = new Date(date);
      checkIn.setHours(shift.startHour, shift.startMinute, 0, 0);
      checkIn.setMinutes(checkIn.getMinutes() + (late ? 40 + (seed % 8) : -4 + (seed % 9)));

      // Scheduled length, plus the break, plus overtime when it applies.
      const plannedMinutes = shift.spanMinutes + shift.breakMinutes;
      const checkOut = missingCheckout ? null : new Date(checkIn);
      if (checkOut) {
        checkOut.setMinutes(
          checkOut.getMinutes() + plannedMinutes + (overtime ? 60 + (seed % 30) : seed % 12),
        );
      }

      attendanceRows.push({
        employeeId: employee.id,
        date,
        checkIn,
        checkOut,
        workedHours: checkOut
          ? Math.round(
              ((checkOut.getTime() - checkIn.getTime()) / 3_600_000 -
                shift.breakMinutes / 60) *
                100,
            ) / 100
          : 0,
        status: missingCheckout
          ? AttendanceStatus.MISSING_CHECKOUT
          : overtime
            ? AttendanceStatus.OVERTIME
            : late
              ? AttendanceStatus.LATE
              : AttendanceStatus.PRESENT,
        isManualEdit: seed === 33,
      });
    }
  }
  // createMany in chunks — a single 13k-row insert can exceed parameter limits.
  for (let i = 0; i < attendanceRows.length; i += 1000) {
    await prisma.attendance.createMany({ data: attendanceRows.slice(i, i + 1000) });
  }
  console.log(`  ${attendanceRows.length} attendance rows`);

  // ------------------------------------------------------------ time off
  const types = await Promise.all([
    prisma.timeOffType.create({
      data: {
        name: 'Paid Time Off',
        code: 'PTO',
        unit: 'DAY',
        requiresAllocation: true,
        isPaid: true,
        color: '#4f46e5',
      },
    }),
    prisma.timeOffType.create({
      data: {
        name: 'Sick Leave',
        code: 'SICK',
        unit: 'DAY',
        requiresAllocation: true,
        isPaid: true,
        color: '#0ea5e9',
      },
    }),
    prisma.timeOffType.create({
      data: {
        name: 'Unpaid Leave',
        code: 'UNPAID',
        unit: 'DAY',
        requiresAllocation: false,
        isPaid: false,
        affectsPayroll: true,
        color: '#f59e0b',
      },
    }),
  ]);

  const [pto, sick, unpaid] = types;
  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: 'hr.manager@oxp.com' } });

  for (const employee of employees) {
    for (const [type, qty] of [
      [pto, 18],
      [sick, 10],
    ] as const) {
      await prisma.timeOffAllocation.create({
        data: {
          employeeId: employee.id,
          typeId: type.id,
          allocatedQty: qty,
          validFrom: new Date(year, 0, 1),
          validTo: new Date(year, 11, 31),
          state: AllocationState.APPROVED,
          approvedById: adminUser.id,
          description: `${year} annual allocation`,
        },
      });
    }
  }

  // A handful of approved + pending requests, with balances consumed.
  for (const [i, employee] of employees.slice(0, 9).entries()) {
    const type = i % 3 === 0 ? sick : pto;
    const from = new Date(year, today.getMonth() - (i % 3), 8 + i);
    const to = new Date(from);
    to.setDate(to.getDate() + (i % 3));
    const duration = (i % 3) + 1;

    const allocation = await prisma.timeOffAllocation.findFirstOrThrow({
      where: { employeeId: employee.id, typeId: type.id },
    });

    const approved = i < 6;
    await prisma.timeOffRequest.create({
      data: {
        employeeId: employee.id,
        typeId: type.id,
        allocationId: approved ? allocation.id : null,
        dateFrom: from,
        dateTo: to,
        duration,
        description: approved ? 'Approved leave' : 'Awaiting approval',
        state: approved ? TimeOffState.APPROVED : TimeOffState.SUBMITTED,
        approvedById: approved ? adminUser.id : null,
        approvedAt: approved ? new Date() : null,
      },
    });

    if (approved) {
      await prisma.timeOffAllocation.update({
        where: { id: allocation.id },
        data: { takenQty: { increment: duration } },
      });
    }
  }

  // Two unpaid-leave requests so a formula rule has something to bite on.
  await prisma.timeOffRequest.create({
    data: {
      employeeId: employees[4].id,
      typeId: unpaid.id,
      dateFrom: new Date(year, today.getMonth(), 12),
      dateTo: new Date(year, today.getMonth(), 13),
      duration: 2,
      state: TimeOffState.APPROVED,
      approvedById: adminUser.id,
      approvedAt: new Date(),
      description: 'Unpaid personal leave',
    },
  });

  // ------------------------------------------------- historical payruns
  console.log('Generating historical payruns…');
  const payrollUser = await prisma.user.findFirstOrThrow({
    where: { email: 'payroll.manager@oxp.com' },
  });

  // `back = 0` is the current month — without it the dashboard opens on an
  // empty period and every KPI reads zero.
  const payslipLines: any[] = [];

  for (let back = 3; back >= 0; back--) {
    const periodStart = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const periodEnd = new Date(today.getFullYear(), today.getMonth() - back + 1, 0);
    const label = periodStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // History is settled; the month in progress stops at COMPUTED so the
    // payrun workflow (validate -> mark paid) is still demonstrable.
    const isCurrent = back === 0;
    const payrun = await prisma.payrun.create({
      data: {
        name: label,
        periodStart,
        periodEnd,
        companyId: company.id,
        salaryStructureId: regular.id,
        createdById: payrollUser.id,
        state: isCurrent ? PayrunState.COMPUTED : PayrunState.PAID,
        computedAt: periodEnd,
        validatedAt: isCurrent ? null : periodEnd,
        paidAt: isCurrent ? null : periodEnd,
      },
    });

    for (const [i, employee] of employees.entries()) {
      if (employee.type === EmployeeType.INTERN) continue;

      const basic = Math.round(employee.wage * 0.5);
      const hra = Math.round(basic * 0.4);
      const std = 10000;
      const gross = basic + hra + std;
      const pf = -Math.round(basic * 0.06);
      const pt = -2000;
      const net = gross + pf + pt;

      const payslip = await prisma.payslip.create({
        data: {
          number: `SLIP/${periodStart.getFullYear()}/${String(
            periodStart.getMonth() + 1,
          ).padStart(2, '0')}/${String(i + 1).padStart(4, '0')}`,
          payrunId: payrun.id,
          employeeId: employee.id,
          salaryStructureId: regular.id,
          periodStart,
          periodEnd,
          state: isCurrent ? PayslipState.COMPUTED : PayslipState.PAID,
          workedDays: 21 + (i % 3),
          workedHours: (21 + (i % 3)) * 8,
          grossAmount: gross,
          netAmount: net,
          warnings: [],
        },
      });

      payslipLines.push(
        ...[
          { code: 'BASIC', name: 'Basic Salary', category: RuleCategory.BASIC, sequence: 1, amount: basic },
          { code: 'HRA', name: 'House Rent Allowance', category: RuleCategory.ALLOWANCE, sequence: 10, amount: hra },
          { code: 'STD', name: 'Standard Allowance', category: RuleCategory.ALLOWANCE, sequence: 20, amount: std },
          { code: 'GROSS', name: 'Gross Salary', category: RuleCategory.GROSS, sequence: 30, amount: gross },
          { code: 'PF', name: 'Provident Fund', category: RuleCategory.DEDUCTION, sequence: 40, amount: pf },
          { code: 'PT', name: 'Professional Tax', category: RuleCategory.DEDUCTION, sequence: 45, amount: pt },
          { code: 'NET', name: 'Net Salary', category: RuleCategory.NET, sequence: 50, amount: net },
        ].map((line) => ({ ...line, payslipId: payslip.id, rate: line.amount, quantity: 1 })),
      );
    }
  }

  // One batched insert beats ~1400 individual round trips at 200 staff.
  for (let i = 0; i < payslipLines.length; i += 1000) {
    await prisma.payslipLine.createMany({ data: payslipLines.slice(i, i + 1000) });
  }

  console.log('\nSeed complete.');
  console.log('  Company        OXP Pvt Ltd');
  console.log(`  Employees      ${employees.length}`);
  console.log('  Structures     Regular Salary (7 rules), Intern Stipend (2 rules)');
  console.log('  Payruns        3 paid months + the current month (computed)');
  console.log('\nLogins (password: password123)');
  for (const [email, names] of accounts) {
    console.log(`  ${email.padEnd(26)} ${names.join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
