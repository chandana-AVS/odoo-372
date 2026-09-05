# PeoplePay360 — HR & Payroll
## Architecture & End-to-End Flow

> **Sources**
> - `Downloads/PeoplePay360 HR & Payroll.pdf` (problem statement)
> - Mockup board: `HRMS OXP - 24 hours` — https://app.excalidraw.com/l/65VNwvy7c4X/17vHpCNFjex
>   (7 flow sections: 0 Login/User Access · 1 Employee & Contract · 2 Attendance · 3 Time Off · 4 Payrun & Payslips · 5 Salary Structures & Rules · 6 Payroll Dashboard)

---

## 1. What actually has to be true

Judging is on **business logic**, not UI polish. Four invariants carry the whole project:

| # | Invariant | Where it bites |
|---|---|---|
| **I1** | An employee has **many contracts over time**, but **exactly one Running contract per period**. Payroll uses the contract valid for the payrun period. | Payslip computation, contract validation |
| **I2** | **Salary Rules actually drive the payslip.** No hardcoded Basic/HRA/PF. Rules execute in `sequence` order and later rules read earlier results. | Computation engine |
| **I3** | **Approved leave consumes an allocation balance.** Balance = allocated − taken, tracked per type + validity period. | Time Off approval |
| **I4** | The **dashboard reads live data** from Employee/Contract/Payslip/Attendance/TimeOff — no static charts. | Reporting layer |

Everything else is CRUD around these four.

---

## 2. Recommended stack

Any stack is allowed. This one is picked for **speed in 24h + strong relational modelling** (the payroll domain is heavily relational; don't use a document DB).

```
Frontend    React 18 + Vite + TypeScript + TailwindCSS + shadcn/ui
            TanStack Query (server state) · React Router · Recharts (dashboard)
Backend     NestJS (or FastAPI) — modular, DI, guards map 1:1 to RBAC
ORM         Prisma (Postgres)         [FastAPI alt: SQLAlchemy + Alembic]
DB          PostgreSQL 16
Auth        JWT access + refresh, bcrypt, role claims in token
PDF         Puppeteer → HTML template → PDF   [alt: WeasyPrint]
Email       Nodemailer + MailHog locally (bulk send from Payrun)
Jobs        BullMQ + Redis (payslip compute + bulk email) — optional, sync is fine for demo
Infra       docker-compose: db, redis, mailhog, api, web
```

**Why not Odoo?** The PDF is Odoo-branded but explicitly says *"teams are free to select any backend language, frontend framework, and database technology."* A custom stack scores better on "Systems Architecture" and is faster to demo.

---

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER — React SPA                                                 │
│                                                                      │
│  Navbar: Employees │ Contracts ▼ │ Attendance │ Time Off ▼ │ Payroll ▼│
│                                    (Requests /   (Dashboard/Payruns/ │
│                                     Allocations/  Payslips/          │
│                                     Types)        Structures/Rules)  │
│                                                                      │
│  Employee Kanban/List → Employee Form (HUB)                          │
│        └── smart buttons: Contracts 2 · Attendance 14 · Time Off 3   │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ REST/JSON + JWT
┌───────────────────────────▼──────────────────────────────────────────┐
│  API LAYER — controllers + RBAC guards + DTO validation              │
├──────────────────────────────────────────────────────────────────────┤
│  DOMAIN SERVICES                                                     │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐         │
│  │ Employee   │ │ Contract   │ │ Attendance │ │ TimeOff    │         │
│  │ Service    │ │ Service    │ │ Service    │ │ Service    │         │
│  └────────────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘         │
│                       │              │              │                │
│                       ▼              ▼              ▼                │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  PAYROLL ENGINE                                            │      │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐   │      │
│  │  │ContractResolv│→ │ RuleEvaluator │→ │ PayslipBuilder │   │      │
│  │  │(period→ctr)  │  │(seq, fixed/%/ │  │(lines, totals) │   │      │
│  │  │              │  │ formula)      │  │                │   │      │
│  │  └──────────────┘  └───────────────┘  └────────────────┘   │      │
│  │  ┌──────────────────────────────────────────────────────┐  │      │
│  │  │ WarningCollector — missing bank/contract/duplicates   │  │      │
│  │  └──────────────────────────────────────────────────────┘  │      │
│  └────────────────────────────────────────────────────────────┘      │
│                       │                                              │
│  ┌────────────────┐   │   ┌──────────────┐  ┌───────────────────┐    │
│  │ PdfService     │◄──┴──►│ MailService  │  │ DashboardService  │    │
│  │ (payslip PDF)  │       │ (bulk send)  │  │ (SQL aggregates)  │    │
│  └────────────────┘       └──────────────┘  └───────────────────┘    │
├──────────────────────────────────────────────────────────────────────┤
│  PERSISTENCE — PostgreSQL (Prisma)                                   │
└──────────────────────────────────────────────────────────────────────┘
```

**Layering rule:** controllers never touch the ORM; the payroll engine is a **pure function** of `(contract, structure, rules, period, attendance, leave)` so it is unit-testable and re-runnable.

---

## 4. Domain model

```
        User ──1:1── Employee ──┬──1:N── Contract ──N:1── SalaryStructure
         │  N:M                 │                              │ 1:N
       Role                     ├──1:N── Attendance            ▼
                                │                          SalaryRule
        Department ──1:N────────┤
        JobPosition ──1:N───────┤
        WorkingSchedule ─1:N────┤ (also on Contract)
             │ 1:N              │
        ScheduleLine            ├──1:N── TimeOffRequest ──N:1── TimeOffType
                                │              │ N:1                 │ 1:N
                                └──1:N── TimeOffAllocation ──────────┘

        Payrun ──1:N── Payslip ──1:N── PayslipLine
           │              │  N:1 Employee / Contract / SalaryStructure
           └── N:1 SalaryStructure, period(start, end)
```

### Core tables

**`User`** — `id, email, passwordHash, employeeId?, isActive`
**`Role`** — `EMPLOYEE | HR_MANAGER | HR_PAYROLL_USER | HR_PAYROLL_MANAGER | ADMIN` (N:M via `UserRole`)

**`Employee`** *(central hub)*
`id, code, firstName, lastName, workEmail, personalEmail, phone, avatarUrl,`
`departmentId, jobPositionId, managerId (self-FK), workingScheduleId, companyId,`
`workLocation, employeeType (FULL_TIME|PART_TIME|CONTRACT|INTERN),`
`bankAccount, isActive`
> `bankAccount` is nullable **on purpose** — it drives the "2 employees missing bank account" warning.

**`Contract`**
`id, employeeId, reference (CON/2026/0042), startDate, endDate?,`
`departmentId, jobPositionId, wage (Decimal 12,2), workingScheduleId,`
`salaryStructureId, structureType, status (DRAFT|RUNNING|EXPIRED|CANCELLED), notes`
> **Constraint:** no two `RUNNING` contracts for the same employee with overlapping `[startDate, endDate]`. Enforce in a service check **and** with a Postgres `EXCLUDE USING gist` constraint if time permits.

**`WorkingSchedule`** — `id, name ("40 Hours / Week"), calendarType (FULL|PART), companyId, isActive`
**`ScheduleLine`** — `id, scheduleId, dayOfWeek (0-6), startTime, endTime, breakMinutes`
> `hoursPerWeek` and `daysPerWeek` are **computed**, never typed in by the user:
> `hoursPerWeek = Σ((end − start) − break) / 60`

**`Attendance`** — `id, employeeId, date, checkIn, checkOut?, workedHours (computed), status (PRESENT|LATE|ABSENT|OVERTIME|MISSING_CHECKOUT), isManualEdit, editedById, notes`

**`TimeOffType`** — `id, name ("Paid Time Off"), code, unit (DAY|HOUR), requiresAllocation, requiresApproval, isPaid, affectsPayroll, color`
**`TimeOffAllocation`** — `id, employeeId, typeId, allocatedQty, takenQty, validFrom, validTo, state (DRAFT|APPROVED|REFUSED), approvedById`
> `remaining = allocatedQty − takenQty` (computed).

**`TimeOffRequest`** — `id, employeeId, typeId, allocationId?, dateFrom, dateTo, duration, description, state (DRAFT|SUBMITTED|APPROVED|REFUSED|CANCELLED), approvedById, approvedAt`

**`SalaryStructure`** — `id, name ("Regular Salary"), code, companyId, isActive` (+ derived `ruleCount`, `employeeCount`)
**`SalaryRule`**
`id, structureId, name, code (BASIC/HRA/STD/GROSS/PF/PT/NET), category (BASIC|ALLOWANCE|GROSS|DEDUCTION|NET),`
`sequence (int), computationType (FIXED|PERCENTAGE|FORMULA),`
`amountFixed?, percentage?, percentageBase (CONTRACT_WAGE|BASIC|GROSS|CATEGORY:<code>),`
`formula? (text), quantity (default 1), condition?, isActive`

**`Payrun`** — `id, name ("February 2026"), salaryStructureId, periodStart, periodEnd, employeeType?, departmentId?, companyId, state (DRAFT|COMPUTED|VALIDATED|PAID), createdById, paidAt`
**`Payslip`** — `id, payrunId, employeeId, contractId, salaryStructureId, periodStart, periodEnd, workedDays, workedHours, leaveDays, grossAmount, netAmount, state (DRAFT|COMPUTED|VALIDATED|PAID), warnings (jsonb), sentAt`
> **Unique index** on `(payrunId, employeeId)`, plus a soft check on `(employeeId, periodStart, periodEnd)` across payruns — this powers the duplicate-payslip warning.

**`PayslipLine`** — `id, payslipId, ruleId, code, name, category, sequence, quantity, rate, amount` (deductions stored negative)

---

## 5. RBAC matrix

| Module | Employee | HR Manager | Payroll User | Payroll Mgr | Admin |
|---|---|---|---|---|---|
| Own profile / attendance / balances | R | — | — | — | — |
| Own attendance entry, Time Off request | C | — | — | — | — |
| Employees, Contracts, Schedules | own R | CRUD | CRUD | CRUD | CRUD |
| Attendance (all) | own R | CRUD | CRUD | CRUD | CRUD |
| Time Off approve / refuse | ✖ | ✔ | ✔ | ✔ | ✔ |
| Payruns / Payslips | own payslip R | ✖ | C, R, U | CRUD | CRUD |
| Salary Structures / Rules | ✖ | ✖ | **R only** | CRUD | CRUD |
| Users, roles, permissions | ✖ | ✖ | ✖ | ✖ | CRUD |

Implementation: a `@Roles('HR_PAYROLL_MANAGER')` guard for coarse module access **plus** a record-scope guard — an `EMPLOYEE` request is auto-filtered by `employeeId = ctx.user.employeeId`.

**Mockup rule:** *"Users must not be able to assign or elevate their own roles."* → block `userId === ctx.user.id` on any role mutation.

---

## 6. The payroll computation engine (the heart)

### 6.1 Contract resolution

```
resolveContract(employeeId, periodStart, periodEnd):
    candidates = contracts where employeeId matches
                 AND status = RUNNING
                 AND startDate <= periodEnd
                 AND (endDate IS NULL OR endDate >= periodStart)
    if 0  → warning NO_ACTIVE_CONTRACT, skip payslip
    if >1 → warning MULTIPLE_ACTIVE_CONTRACTS (data error, block validation)
    else  → that contract
```

### 6.2 Rule evaluation (ordered, dependency-aware)

Rules run **in ascending `sequence`**. Each result is written into two dictionaries that later rules can read — this is what makes GROSS and NET possible without hardcoding.

```js
ctx = {
  contract, employee, payslip, periodStart, periodEnd,
  worked_days, worked_hours, leave_days, unpaid_leave_days,
  rules:      {},   // rules['BASIC']          → 50000
  categories: {}    // categories['ALLOWANCE'] → 30000  (running subtotal)
}

for (rule of structure.rules.sortBy('sequence')) {
    if (rule.condition && !safeEval(rule.condition, ctx)) continue;

    amount = switch (rule.computationType) {
      FIXED      → rule.amountFixed
      PERCENTAGE → rule.percentage / 100 * resolveBase(rule.percentageBase, ctx)
      FORMULA    → safeEval(rule.formula, ctx)      // formula sets `result`
    } * rule.quantity

    if (rule.category === 'DEDUCTION') amount = -abs(amount)

    push PayslipLine{ rule, code, name, category, sequence, quantity, rate, amount }
    ctx.rules[rule.code] = amount
    ctx.categories[rule.category] += amount
}

payslip.gross = line where code = 'GROSS'  ?? Σ(BASIC + ALLOWANCE)
payslip.net   = line where code = 'NET'    ?? gross + Σ(DEDUCTION)
```

`resolveBase`: `CONTRACT_WAGE → contract.wage` · `BASIC → ctx.rules['BASIC']` · `GROSS → ctx.rules['GROSS']` · `CATEGORY:X → ctx.categories[X]`

### 6.3 Seed structure — "Regular Salary" (matches the mockup exactly)

| Seq | Code | Name | Category | Computation | Result |
|----|------|------|----------|-------------|--------|
| 1 | `BASIC` | Basic Salary | BASIC | Percentage of **Contract Wage**, 50% | ₹50,000 |
| 10 | `HRA` | House Rent Allowance | ALLOWANCE | Percentage of **Basic**, 40% | ₹20,000 |
| 20 | `STD` | Standard Allowance | ALLOWANCE | Fixed Amount | ₹10,000 |
| 30 | `GROSS` | Gross Salary | GROSS | Formula `result = categories['BASIC'] + categories['ALLOWANCE']` | ₹80,000 |
| 40 | `PF` | Provident Fund | DEDUCTION | Percentage of **Basic**, 6% | −₹3,000 |
| 45 | `PT` | Professional Tax | DEDUCTION | Fixed Amount | −₹2,000 |
| 50 | `NET` | Net Salary | NET | Formula `result = rules['GROSS'] + categories['DEDUCTION']` | **₹75,000** |

*(The mockup's contract wage is ₹85,000 and its payslip shows Basic ₹50,000 — either seed BASIC as a fixed amount or tune the percentage. The mockup's rule form literally reads: `Basic Salary / BASIC / Basic / Percentage of Wage / 50%`, sequence 1.)*

**Formula sandbox:** never `eval()` raw input. Use a restricted expression evaluator (`expr-eval` in JS, `asteval` in Python) exposing only `rules`, `categories`, `contract`, `worked_days`, `leave_days` and arithmetic. The mockup's own example is `result = categories['BASIC'] …`.

### 6.4 Advanced (formula) examples worth demoing

```python
# Attendance-prorated basic
result = contract.wage * 0.5 * (worked_days / expected_days)

# Unpaid leave deduction
result = -(rules['BASIC'] / expected_days) * unpaid_leave_days

# Overtime at 1.5x
result = (rules['BASIC'] / (expected_days * 8)) * 1.5 * overtime_hours
```

### 6.5 Warning collector (runs on Compute, blocks on Validate)

| Code | Trigger | Severity |
|---|---|---|
| `NO_ACTIVE_CONTRACT` | contract resolution empty | **blocking** |
| `MULTIPLE_ACTIVE_CONTRACTS` | >1 running contract in period | **blocking** |
| `DUPLICATE_PAYSLIP` | another payslip exists for same employee + period | **blocking** |
| `NO_SALARY_STRUCTURE` | contract has no structure | **blocking** |
| `NEGATIVE_NET` | net < 0 | **blocking** |
| `MISSING_BANK_ACCOUNT` | `employee.bankAccount` is null | warning |
| `MISSING_WORK_EMAIL` | blocks Send Payslips | warning |
| `CONTRACT_EXPIRING` | `endDate` falls inside the period | info |

---

## 7. State machines

**Payrun** — the mockup states the flow as `Draft → Compute → Validate → Mark Paid`

```
 DRAFT ──Compute──► COMPUTED ──Validate──► VALIDATED ──Mark Paid──► PAID
   ▲                    │                                            │
   └────Recompute───────┘                                   Send Payslips (email)
        (allowed only while DRAFT / COMPUTED)               Print Payslip (PDF)
```

- `Compute` — (re)generates Payslips + PayslipLines + warnings for every selected employee.
- `Validate` — refuses if any **blocking** warning exists; locks the payslips.
- `Mark Paid` — sets `paidAt`; the record becomes **immutable history**. No edits, no deletes.
- `Send Payslips` — bulk email with PDF attachment, skips employees with no work email, stamps `payslip.sentAt`.

**Time Off Request** — `DRAFT → SUBMITTED → APPROVED | REFUSED` (→ `CANCELLED`)
On `APPROVED`, in **one transaction**: find the approved allocation covering those dates → `takenQty += duration` → fail if `takenQty > allocatedQty` → link `request.allocationId`.

**Contract** — `DRAFT → RUNNING → EXPIRED` (or `CANCELLED`). Moving to `RUNNING` runs the overlap check.

---

## 8. Screen & route map (from the mockup)

**Top nav:** `Employees` · `Contracts ▼` · `Attendance` · `Time Off ▼` · `Payroll ▼`

> Mockup rule: *Requests, Allocations and Time Off Types must be reached from `Time Off ▼` in the navbar — do NOT add separate page buttons for them.* Same shape for Payroll's sub-menu: `Dashboard · Payruns · Payslips · Structures · Rules`.

| Route | Screen | Notes from mockup |
|---|---|---|
| `/login` | Sign in — "Welcome back / Sign in to continue to your workspace" | work email + password |
| `/admin/users` | User Management *(ADMIN ONLY)* | columns User, Employee, Work Email, Role, Status · `+ New User` → Create/Edit User (link to Employee, assign roles) |
| `/employees` | Kanban **and** List toggle | both open the same Employee Form |
| `/employees/:id` | **Employee Form = operational hub** | smart buttons with counts: `Contracts 2` `Attendance 14` `Time Off 3` → open **pre-filtered** child lists. Tabs: Work Info / Private Information. Fields: Department, Manager, Working Schedule, Job Position, Work Location, Company, Work Email, Status |
| `/contracts` | Contract list | dates, wage, status; **Running highlighted** |
| `/contracts/:id` | Contract form | Employee, Department, Job Position, Start/End Date, Wage/Month ₹85,000, Working Schedule, Salary Structure, Status (Running), Notes |
| `/schedules` | Working Schedule list | name, calendar type, days/week, hours/week, company, status |
| `/schedules/:id` | Schedule form | weekly grid: Day · Start · End · Break, rows removable (`×`), **hours/week auto-derived** |
| `/attendance` | Attendance list | Check In, Check Out, Worked Hours, Status |
| — | **Attendance widget** (navbar icon) | 🔴 = no active session → shows **Check In**; 🟢 = checked in → shows **Check Out** + live elapsed (`9:48 AM — Now · 6h56`, `Today 6h56`). Turns green after check-in. |
| `/attendance/:id` | Attendance form | manual correction, authorized roles only, sets `isManualEdit` |
| `/time-off/requests` | Requests list | Employee, Type, Dates, Duration, Status |
| `/time-off/requests/:id` | Request form | Approve / Refuse |
| `/time-off/allocations` | Allocations list + form | allocated / taken / remaining / validity |
| `/time-off/types` | Time Off Types | unit, requiresAllocation, approval, payroll impact |
| `/payroll/payruns/new` | **2-step wizard** | **Step 1** scope: Employee Type, Salary Structure, Period (Sep 1 – Sep 30) → `Continue` (creates **nothing**) · **Step 2** `Select Employee Records` — searchable, paginated `1–22 / 22`, columns ✓ / Employee / Working Hours / Start Date / Wage / Pay Structure → `Create Payrun` (with `Back`, `Discard`) |
| `/payroll/payruns` | Payrun list | January 2026 / February 2026 / March 2026 with status |
| `/payroll/payruns/:id` | Payrun processing | actions `COMPUTE` `VALIDATE` `MARK PAID` `SEND PAYSLIPS` · header: name, structure, period, status · payslip table: Net ₹75k / Structure Regular / Status Done · warnings banner |
| `/payroll/payslips` | Payslip list | filterable |
| `/payroll/payslips/:id` | Payslip + Salary Computation | header: Employee, Salary Structure, Pay Run, Period `01-Feb — 28-Feb`, Status, **Worked Days 22** · table **Rule / Category / Amount / Code** · actions `COMPUTE` `MARK PAID` `PRINT PAYSLIP` |
| `/payroll/structures` | Structures list | name, #rules, #employees, active |
| `/payroll/structures/:id` | Structure form | included rules **in sequence order** |
| `/payroll/rules` | Rules list | Name, Code, Category, Structure, **Sequence** |
| `/payroll/rules/:id` | Rule form | Rule Name, Code, Category, Salary Structure, Computation (Fixed Amount / Percentage of Wage / Python Code), Percentage, Quantity, Sequence |
| `/payroll/dashboard` | Payroll Dashboard | see §9 |

---

## 9. Payroll Dashboard

**Filter bar:** `Period` (Sep 2026) · `Department` (All Departments) · `Employee Type` (All Types) · `Company` (OXP Pvt Ltd). Every filter re-queries the server; nothing is faked client-side.

**KPI cards:** Total Net Salary Paid · Payslips Generated · Avg Salary / Employee · Approved Time Off Days · Attendance Health

**Charts:**
- *Salary Cost by Department* — bar (HR, Sales, Support, Finance, IT)
- *Monthly Net Salary Trend* — line, 6 months (Apr→Sep: 15.2L, 14.8L, 14.3L, 18.4L, 17.1L, 15.0L)
- *Payslip Status & Payroll Alerts* — status split (Paid / Done / Pending / Warning) plus a live alert list:
  `• 2 employees missing bank account` `• 1 duplicate payslip warning` `• 4 drafts still not validated` `• 3 contracts expiring this month`

**Panels (the mockup names each panel's source explicitly):**

| Panel | Source models |
|---|---|
| Attendance Overview — Present, Late, Absent, Overtime, missing check-outs, manual edits, coverage % | `Attendance` |
| Time Off Overview — Type, Approved Days, Pending, Remaining | `TimeOffRequest` + `TimeOffAllocation` |
| Department Overview — Department, Headcount, Monthly Salary | `Employee` + `Contract` + `Payslip` totals |

> Mockup: *"This is the actual challenge behind the dashboard"* — aggregating across **5 models**. Implement it as **one** `GET /dashboard?period&department&employeeType&company` endpoint backed by SQL `GROUP BY` / CTEs, not N round-trips.

---

## 10. API surface

```
POST   /auth/login                         → {access, refresh, roles}
GET    /auth/me
CRUD   /users                              (ADMIN)   POST /users/:id/roles

GET    /employees?view=kanban|list&department&type&q
CRUD   /employees/:id
GET    /employees/:id/summary              → {contracts:2, attendance:14, timeOff:3}

CRUD   /contracts            GET /contracts?employeeId=
POST   /contracts/:id/activate             → runs overlap validation

CRUD   /working-schedules                  (hoursPerWeek derived server-side)

GET    /attendance?employeeId&from&to
POST   /attendance/check-in                → opens a session
POST   /attendance/check-out               → closes it, computes workedHours
GET    /attendance/current                 → drives the navbar widget colour
PATCH  /attendance/:id                     → manual correction (sets isManualEdit)

CRUD   /time-off/types
CRUD   /time-off/allocations               POST /time-off/allocations/:id/approve
CRUD   /time-off/requests
POST   /time-off/requests/:id/approve      → transactional balance consumption
POST   /time-off/requests/:id/refuse
GET    /time-off/balances?employeeId

CRUD   /salary-structures                  (rules returned ordered by sequence)
CRUD   /salary-rules

POST   /payruns/eligible-employees         ← wizard step 2 (body = scope; creates NOTHING)
POST   /payruns                            ← "Create Payrun" (scope + employeeIds)
GET    /payruns/:id                        → payrun + payslips + warnings
POST   /payruns/:id/compute
POST   /payruns/:id/validate               → 409 if any blocking warning
POST   /payruns/:id/mark-paid
POST   /payruns/:id/send-payslips          → bulk email + PDF

GET    /payslips?payrunId&employeeId&period
POST   /payslips/:id/compute
GET    /payslips/:id/pdf                   → application/pdf

GET    /dashboard?period&department&employeeType&company
```

> **Critical:** `POST /payruns/eligible-employees` is a **read** that returns candidates. `Continue` must not persist a Payrun. Mockup: *"Continue only moves to employee selection. A Payrun is created only after clicking Create Payrun."*

---

## 11. Project structure

```
peoplepay360/
├─ docker-compose.yml            # postgres, redis, mailhog, api, web
├─ apps/
│  ├─ api/
│  │  ├─ prisma/schema.prisma
│  │  ├─ prisma/seed.ts          # roles, depts, schedules, 22 employees,
│  │  │                          # contracts, Regular Salary structure + 7 rules,
│  │  │                          # 3 months of attendance, leave, 2 past payruns
│  │  └─ src/
│  │     ├─ auth/  users/  roles/
│  │     ├─ employees/  contracts/  schedules/
│  │     ├─ attendance/  time-off/
│  │     ├─ payroll/
│  │     │  ├─ structures/  rules/  payruns/  payslips/
│  │     │  └─ engine/
│  │     │     ├─ contract-resolver.ts
│  │     │     ├─ rule-evaluator.ts       # ← unit-tested
│  │     │     ├─ payslip-builder.ts
│  │     │     ├─ formula-sandbox.ts
│  │     │     └─ warning-collector.ts
│  │     ├─ dashboard/
│  │     └─ shared/ (pdf, mail, guards, decorators)
│  └─ web/src/
│     ├─ layouts/AppShell.tsx    # navbar + attendance widget
│     ├─ features/{employees,contracts,schedules,attendance,timeoff,payroll,dashboard}
│     └─ components/ui/ (DataTable, KanbanBoard, SmartButton, FormGrid, StatusBadge)
```

---

## 12. Build order for a 24-hour run

| Block | Hours | Deliverable |
|---|---|---|
| **0. Skeleton** | 0–2 | docker-compose, Prisma schema (all tables), migrate, auth + JWT + role guards, app shell + navbar |
| **1. Master data** | 2–6 | Employee Kanban/List/Form + smart buttons · Department/JobPosition · Working Schedule with derived hours · Contract CRUD + overlap validation |
| **2. Ops** | 6–10 | Attendance list/form + **check-in/out widget** (red/green + elapsed) · Time Off Types, Allocations, Requests + approve → balance consumption |
| **3. Payroll config** | 10–13 | Salary Structures + Rules CRUD, sequence editor · **seed the Regular Salary structure** |
| **4. Engine** ⭐ | 13–17 | ContractResolver · RuleEvaluator (fixed / % / formula) · PayslipBuilder · WarningCollector · **unit tests asserting wage ₹85,000 → net ₹75,000** |
| **5. Payrun UX** | 17–20 | 2-step wizard · Payrun screen with Compute/Validate/Mark Paid/Send · Payslip + Salary Computation table |
| **6. Output** | 20–22 | Payslip PDF template + Print · bulk email via MailHog |
| **7. Dashboard** | 22–23 | single aggregate endpoint + KPI cards + 3 charts + 3 panels |
| **8. Demo prep** | 23–24 | seed 3 months of history, rehearse, record a fallback video |

**Do first, no matter what:** the schema and the rule evaluator. Everything else degrades gracefully; those two don't.

---

## 13. Demo script (5 minutes, two end-to-end scenarios)

**Scenario A — Employee → Payslip (3 min)**
1. Log in as Payroll Manager. Open **Employees** (Kanban) → Aarav Mehta.
2. Smart buttons: `Contracts 2` → show the **expired 2025** contract and the **Running** ₹85,000 one. State the rule: payroll picks the period-valid contract.
3. Open the contract's **Working Schedule** → 40 Hours/Week, derived from the day grid.
4. **Payroll → Structures → Regular Salary** → 7 rules in sequence 1→50. Open `HRA`: *Percentage of Basic, 40%*. **Change it to 45% and save.**
5. **Payruns → NEW** → Step 1 scope (Regular Salary, Sep 2026) → `Continue` → Step 2 select employees → `Create Payrun`.
6. `Compute` → open Aarav's payslip → the computation table now reflects **45%** — proof the rules drive the numbers.
7. Warning banner: *2 employees missing bank account*. Fix one, recompute, `Validate` → `Mark Paid`.
8. `Print Payslip` (PDF) → `Send Payslips` → show the MailHog inbox.

**Scenario B — Allocation → Request → Balance (1.5 min)**
1. **Time Off ▼ → Types** → Paid Time Off (requires allocation).
2. **Allocations** → allocate 12 days to Aarav → approve → balance 12 / 0 / 12.
3. **Requests** → Aarav requests 3 days → Approve → allocation now **taken 3, remaining 9**, and the request is linked to that allocation.

**Close (30s)** — open the **Dashboard**, change the Period and Department filters, show every card and chart move.

---

## 14. Traps that lose points

1. Persisting the Payrun on `Continue` — the wizard must create nothing until `Create Payrun`.
2. Hardcoding Basic/HRA/PF in the payslip generator. Editing a rule must change the payslip.
3. Storing `hoursPerWeek` as a typed field instead of deriving it from the schedule lines.
4. Letting two `RUNNING` contracts overlap for one employee.
5. Approving leave without decrementing the allocation, or letting the balance go negative.
6. A dashboard built on constants.
7. Allowing edits to a `PAID` payrun — finalized payroll is **immutable history**.
8. Ignoring rule `sequence`, so `GROSS` computes before its allowances exist.
9. Putting Requests/Allocations/Types as top-level nav buttons — the mockup explicitly forbids it.
10. Skipping the warnings panel — "surface issues before finalization" is called out in both the PDF and the mockup.

---

## 15. Future roadmap (for the deliverable)

- Multi-company / multi-currency, statutory tax slabs per region
- Payslip versioning + full audit log (who computed / validated / paid)
- Employee self-service portal + mobile check-in with geofence
- Approval chains (manager → HR → payroll) with delegation
- Bank transfer file export (NEFT / ACH / SEPA), GL journal export to accounting
- Async payrun computation via BullMQ for 10k+ employees
- Rule versioning so a historical payslip can always be recomputed identically
- Attendance regularization workflow, shift & roster planning, overtime policies
