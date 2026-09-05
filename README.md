# PeoplePay360 — HR & Payroll

An integrated HR and payroll platform: employee master data → contracts & working
schedules → attendance & time off → salary rules → payruns → payslips → PDF, email
and a live dashboard.

Architecture and design rationale: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---

## Tech stack

**Backend** (`apps/api`) — Node ≥20 · TypeScript 5.7 · NestJS 10 (Express) ·
Prisma 5 · PostgreSQL 16 · Passport-JWT + bcryptjs · class-validator ·
**expr-eval** (sandboxed salary formulas) · Puppeteer (payslip PDFs) ·
Nodemailer · Vitest.

**Frontend** (`apps/web`) — React 18 · Vite 6 · TypeScript 5.7 ·
React Router 6 · TanStack Query 5 · Tailwind CSS 3 · Recharts · lucide-react.
UI primitives are hand-built in `components/ui.tsx` — no component library.

**Infrastructure** — Docker Compose (PostgreSQL, MailHog, Redis) ·
npm workspaces monorepo.

> **Redis is provisioned but not yet wired in.** The container starts and idles;
> no application code connects to it. It is reserved for dashboard-aggregate
> caching, which is the slowest read in the system.

---

## Running it

```bash
docker compose up -d          # postgres :5433, redis :6380, mailhog :8025
npm install
npm run db:push               # create the schema
npm run seed                  # 200 employees, 4 payruns

npm run dev:api               # http://localhost:4000/api
npm run dev:web               # http://localhost:5180
```

`npm run setup` does all four setup steps in one command.

| Service                  | URL                       |
| ------------------------ | ------------------------- |
| Web app                  | http://localhost:5180     |
| API                      | http://localhost:4000/api |
| MailHog (payslip emails) | http://localhost:8025     |
| Prisma Studio            | `npm run studio`          |

### Seed size

The seed is parameterised, so the dataset can match the scenario you want to show:

```bash
SEED_HEADCOUNT=500 npm run seed        # default 200
SEED_ATTENDANCE_DAYS=90 npm run seed   # default 30
```

22 people are hand-written (managers, the missing-bank-account cases, the
contract-history demo); the rest are generated deterministically, so re-seeding
reproduces the same organisation. Three staff carry fixed real email addresses.

> **Port note.** The web dev server runs on **5180**, not Vite's default 5173,
> because another project on this machine already uses 5173. It binds all
> interfaces (`host: true`) — on Windows, binding "localhost" can claim IPv6 only,
> which leaves IPv4 clients hitting whatever else holds the port.

> **Database note.** Postgres runs in Docker on port **5433** with its own
> credentials (`peoplepay` / `peoplepay`). Your local Postgres install is not
> touched, so its password is irrelevant here.

### Logins — password `password123`

| Email                     | Role                                           |
| ------------------------- | ---------------------------------------------- |
| `payroll.manager@oxp.com` | HR Payroll Manager — full payroll access       |
| `payroll.user@oxp.com`    | HR Payroll User — payruns yes, rule editing no |
| `hr.manager@oxp.com`      | HR Manager — HR only, no payroll               |
| `employee@oxp.com`        | Employee — own records only                    |
| `admin@oxp.com`           | Admin — everything + user management           |

---

## What is verified working

```
npm test          # 8 engine tests, all passing
```

End-to-end, exercised against the running API:

- **Wizard step 1 → Continue persists nothing.** `POST /payruns/eligible-employees`
  is a pure read; the payrun count is unchanged until `Create Payrun`.
- **Rules drive the payslip.** Wage ₹85,000 → BASIC 42,500 → HRA 17,000 →
  GROSS 69,500 → PF −2,550 → PT −2,000 → **NET 64,950**.
  Editing HRA 40% → 45% and recomputing gives HRA 19,125 / NET 67,075.
- **Warnings surface before finalisation** — `MISSING_BANK_ACCOUNT` appears on
  compute; blocking warnings refuse `validate`.
- **Duplicate employees are caught.** A record sharing a name *and* bank account
  with another raises a blocking `DUPLICATE_EMPLOYEE` warning, and `validate` is
  refused until it is resolved.
- **Workflow** `DRAFT → COMPUTED → VALIDATED → PAID`; a paid payrun refuses
  recomputation ("historical and cannot be recomputed").
- **Leave consumes balance** — approving 3 days moves PTO 18/0/18 → 18/3/15, and a
  99-day request is refused with "Insufficient balance: 15 day(s) remaining".
- **Overtime is paid only when approved.** A weekday 1h30 request quotes ₹498.58
  (1.5×); the same hours on a Saturday quote ₹664.77 (2×). Rejecting stores no
  amount, so nothing is paid.
- **PDF** — `GET /payslips/:id/pdf` returns a real 120KB `%PDF-1.4`.
- **Bulk email** — `POST /payruns/:id/send-payslips` delivered 3 payslips to MailHog.

---

## Attendance, overtime and approvals

Working time is shift-aware. Three patterns ship in the seed — **09:00–18:00**,
**10:00–18:00**, and a **20:00–04:00 night shift** that correctly crosses midnight —
plus a 20-hour part-time week. Check-in and check-out are generated per employee
per day from their own roster, never one clock time for the whole company.

**The 8-hour rule.** Checking out after exactly 8 hours passes silently. Anything
else opens a confirmation dialog: the employee picks **Extra Time** or **Early
Logout**, gives a reason, and the request goes for review. A 2-minute grace either
side prevents a prompt over trivial seconds.

Requests can also be raised after the fact — **Attendance → New Request** lists
completed days from the last 60 that were not 8 hours and have no request yet.

**Overtime pay** is derived, not typed in:

```
hourly rate = basic ÷ (22 working days × 8 hours)      basic = 50% of contract wage
weekday overtime = hours × rate × 1.5
weekend overtime = hours × rate × 2.0
```

Approving prices the overtime at that moment and stores the figure on the request,
so payroll pays exactly what HR saw. Payroll counts **only approved** requests — an
`OVERTIME` clock reading alone earns nothing. The computed value reaches salary
rules as the `overtime_amount` formula variable.

**Who does what**

| Actor | Can |
| ----- | --- |
| Employee | Raise a request, see their own under **Attendance → My Requests** |
| HR Manager / HR Payroll User / HR Payroll Manager / Admin | See and decide every request under **Attendance → Attendance Requests** |

Submitting emails the employee's manager; deciding emails the employee with the
outcome and the amount.

---

## Payroll pre-flight

Before a payrun is created, the wizard checks the **ticked** employees and groups
what it finds by problem rather than by person:

| Severity     | Issue                                                          |
| ------------ | -------------------------------------------------------------- |
| **Blocking** | Already has a payslip for this period · possible duplicate employee · no salary structure |
| **Warning**  | No bank account · no work email                                |

Blocking issues disable **Create Payrun**; warnings allow it. Each group expands to
name the people, with a link straight to the record. Every check runs again at
Compute, so nothing is missed if the wizard is bypassed.

---

## Layout

```
peoplepay360/
├─ docker-compose.yml
├─ apps/api/                       NestJS + Prisma + PostgreSQL
│  ├─ prisma/schema.prisma         full domain model
│  ├─ prisma/seed.ts               parameterised demo data
│  └─ src/
│     ├─ auth/ users/              JWT, roles, admin user management
│     ├─ employees/ contracts/ schedules/
│     ├─ attendance/               check-in/out, requests, overtime.util.ts
│     ├─ time-off/
│     ├─ payroll/
│     │  ├─ engine/                ← the graded part
│     │  │  ├─ contract-resolver.ts    I1: period-valid contract
│     │  │  ├─ rule-evaluator.ts       I2: ordered rule execution (pure)
│     │  │  ├─ formula-sandbox.ts      safe expression evaluation
│     │  │  ├─ payslip-builder.ts      persists payslip + lines
│     │  │  └─ warning-collector.ts    pre-finalisation checks
│     │  ├─ structures/ payruns/ payslips/
│     ├─ dashboard/                one endpoint, five models
│     └─ shared/                   pdf.service.ts, mail.service.ts
└─ apps/web/                       React 18 + Vite + Tailwind
   └─ src/
      ├─ components/ui.tsx         design system primitives
      ├─ lib/search.ts             shared client-side search
      ├─ layouts/                  AppShell, AttendanceWidget, GlobalSearch
      └─ features/                 one folder per module
```

---

## The four invariants

| #      | Invariant                                                                               | Enforced in                                    |
| ------ | --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **I1** | Exactly one RUNNING contract per employee per period; payroll uses the period-valid one | `contract-resolver.ts`, `contracts.service.ts` |
| **I2** | Salary rules drive the payslip — nothing hardcoded, sequence respected                  | `rule-evaluator.ts`                            |
| **I3** | Approved leave consumes allocation balance, transactionally, never negative             | `time-off.service.ts`                          |
| **I4** | Dashboard reads live rows across five models                                            | `dashboard.service.ts`                         |

### Writing a salary rule

Three computation types:

- **Fixed** — `amountFixed`, e.g. Standard Allowance 10,000
- **Percentage** — `percentage` of `percentageBase` (contract wage / basic / gross /
  a category subtotal), e.g. HRA = 40% of Basic
- **Formula** — a sandboxed expression assigning `result`:

  ```
  result = categories['BASIC'] + categories['ALLOWANCE']
  result = rules['GROSS'] + categories['DEDUCTION']
  result = wage * 0.5 * (worked_days / expected_days)
  result = -(rules['BASIC'] / expected_days) * unpaid_leave_days
  result = overtime_amount
  ```

  Available: `rules['CODE']`, `categories['CATEGORY']`, `wage`, `worked_days`,
  `worked_hours`, `expected_days`, `expected_hours`, `leave_days`,
  `unpaid_leave_days`, `overtime_hours`, `overtime_amount`.
  Evaluated with `expr-eval` — never `eval()`.

---

## Search

Every list view has search, and there is a global palette on **⌘/Ctrl + K** (or `/`)
covering employees, contracts, payruns, payslips, structures and page names,
respecting the signed-in user's roles.

Filtering is shared in `lib/search.ts`: multi-term AND (`running meera` narrows),
quoted phrases, case-insensitive, underscore-aware (`missing checkout` matches
`MISSING_CHECKOUT`), and dates matched as displayed. Employees and users additionally
search server-side via a `q` parameter.

---

## UI notes

- **Responsive** — nav collapses to a slide-in sheet below `lg`; every wide table
  scrolls inside its own container so the page never scrolls sideways; modals are
  bottom sheets on mobile and centred dialogs on desktop.
- **Light + dark** — all colour goes through CSS variables in `index.css`; the theme
  is applied before first paint so there is no flash.
- **Attendance widget** — red = no session (Check In), green = checked in (Check Out
  with a live elapsed counter), exactly as the mockup specifies.
- **Navigation** — Requests / Allocations / Types are reachable _only_ from the
  `Time Off` dropdown, per the mockup's explicit instruction.

---

## Not yet built

The scaffold favours the graded business logic. Known gaps, in rough priority order:

- **No CI/CD.** No GitHub Actions workflow, no Dockerfiles for the two apps. The
  commands a pipeline would run already exist: `npm test` and `tsc -b`.
- **Prisma migrations** — currently `db push`, so schema changes are not versioned.
  Run `npx prisma migrate dev` before any deployment that needs migration history.
- **Attendance requests are single-stage.** HR approves or rejects directly; the
  TL → Manager → HR chain with per-stage comments is not built. The schema carries
  `decidedById` / `decidedAt` / `decisionNote` and would need extending for it.
- **Approved overtime is not yet on a payslip.** The engine supplies
  `overtime_amount`, but the seeded "Regular Salary" structure has no rule that
  consumes it, so the figure is tracked without being paid.
- **Email goes to MailHog only.** Delivery to real inboxes needs an SMTP or HTTP
  provider plus a verified sending domain for SPF/DKIM/DMARC.
- **Attendance list is capped at 500 rows** server-side. At 200 staff a 30-day
  window holds ~4,200 rows, so the page silently truncates and client-side search
  filters only what was returned. Needs pagination or a server-side `q`.
- Create/edit forms for **working schedules** (the API endpoints exist and work;
  only the UI forms are missing). Employees and contracts are fully editable —
  **New Employee** on the list, **New Employee & Contract** on Contracts (admin).
- Drag-to-reorder for salary rules (the `POST /salary-structures/:id/reorder`
  endpoint is implemented; the UI edits `sequence` numerically).
- Accessibility — hand-built primitives handle Escape and scroll-locking, but do
  not trap focus. A library such as Radix would close this.
- The `EXCLUDE USING gist` database-level constraint for contract overlap; the rule
  is currently enforced in the service layer only.
