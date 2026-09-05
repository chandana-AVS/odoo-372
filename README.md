# PeoplePay360 — HR & Payroll

An integrated HR and payroll platform: employee master data → contracts & working
schedules → attendance & time off → salary rules → payruns → payslips → PDF, email
and a live dashboard.

Architecture and design rationale: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---

## Running it

Everything below is already done once — this is the from-scratch sequence.

```bash
docker compose up -d          # postgres :5433, redis :6380, mailhog :8025
npm install
npm run db:push               # create the schema
npm run seed                  # 22 employees, 3 months of history

npm run dev:api               # http://localhost:4000/api
npm run dev:web               # http://localhost:5180
```

| Service | URL |
|---|---|
| Web app | http://localhost:5180 |
| API | http://localhost:4000/api |
| MailHog (payslip emails) | http://localhost:8025 |
| Prisma Studio | `npm run studio` |

> **Port note.** The web dev server runs on **5180**, not Vite's default 5173,
> because another project on this machine already uses 5173. It binds all
> interfaces (`host: true`) — on Windows, binding "localhost" can claim IPv6 only,
> which leaves IPv4 clients hitting whatever else holds the port.

> **Database note.** Postgres runs in Docker on port **5433** with its own
> credentials (`peoplepay` / `peoplepay`). Your local Postgres install is not
> touched, so its password is irrelevant here.

### Logins — password `password123`

| Email | Role |
|---|---|
| `payroll.manager@oxp.com` | HR Payroll Manager — full payroll access |
| `payroll.user@oxp.com` | HR Payroll User — payruns yes, rule editing no |
| `hr.manager@oxp.com` | HR Manager — HR only, no payroll |
| `employee@oxp.com` | Employee — own records only |
| `admin@oxp.com` | Admin — everything + user management |

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
- **Workflow** `DRAFT → COMPUTED → VALIDATED → PAID`; a paid payrun refuses
  recomputation ("historical and cannot be recomputed").
- **Leave consumes balance** — approving 3 days moves PTO 18/0/18 → 18/3/15, and a
  99-day request is refused with "Insufficient balance: 15 day(s) remaining".
- **PDF** — `GET /payslips/:id/pdf` returns a real 120KB `%PDF-1.4`.
- **Bulk email** — `POST /payruns/:id/send-payslips` delivered 3 payslips to MailHog.

---

## Layout

```
peoplepay360/
├─ docker-compose.yml
├─ apps/api/                       NestJS + Prisma + PostgreSQL
│  ├─ prisma/schema.prisma         full domain model
│  ├─ prisma/seed.ts               representative demo data
│  └─ src/
│     ├─ auth/ users/              JWT, roles, admin user management
│     ├─ employees/ contracts/ schedules/
│     ├─ attendance/ time-off/
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
      ├─ layouts/                  AppShell + AttendanceWidget
      └─ features/                 one folder per module
```

---

## The four invariants

| # | Invariant | Enforced in |
|---|---|---|
| **I1** | Exactly one RUNNING contract per employee per period; payroll uses the period-valid one | `contract-resolver.ts`, `contracts.service.ts` |
| **I2** | Salary rules drive the payslip — nothing hardcoded, sequence respected | `rule-evaluator.ts` |
| **I3** | Approved leave consumes allocation balance, transactionally, never negative | `time-off.service.ts` |
| **I4** | Dashboard reads live rows across five models | `dashboard.service.ts` |

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
  ```

  Available: `rules['CODE']`, `categories['CATEGORY']`, `wage`, `worked_days`,
  `worked_hours`, `expected_days`, `expected_hours`, `leave_days`,
  `unpaid_leave_days`, `overtime_hours`. Evaluated with `expr-eval` — never `eval()`.

---

## UI notes

- **Responsive** — nav collapses to a slide-in sheet below `lg`; every wide table
  scrolls inside its own container so the page never scrolls sideways; modals are
  bottom sheets on mobile and centred dialogs on desktop.
- **Light + dark** — all colour goes through CSS variables in `index.css`; the theme
  is applied before first paint so there is no flash.
- **Attendance widget** — red = no session (Check In), green = checked in (Check Out
  with a live elapsed counter), exactly as the mockup specifies.
- **Navigation** — Requests / Allocations / Types are reachable *only* from the
  `Time Off` dropdown, per the mockup's explicit instruction.

---

## Not yet built

The scaffold favours the graded business logic. Still to add:

- Create/edit forms for **contracts and working schedules** (the API endpoints exist
  and work; only the UI forms are missing). Employees are fully editable —
  **New Employee** on the list, **Edit** on the employee form.
- Drag-to-reorder for salary rules (the `POST /salary-structures/:id/reorder`
  endpoint is implemented; the UI edits `sequence` numerically).
- Prisma migrations — currently `db push`. Run `npx prisma migrate dev` before any
  deployment that needs migration history.
- The `EXCLUDE USING gist` database-level constraint for contract overlap; the rule
  is currently enforced in the service layer only.
