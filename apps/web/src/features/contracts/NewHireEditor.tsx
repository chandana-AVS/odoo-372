import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, UserPlus } from 'lucide-react';
import * as React from 'react';
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';

/**
 * Admin onboarding: creates the employee record AND their first contract in one
 * pass. The two are separate API calls, so `created` below tracks the employee
 * once it exists — if the contract call then fails the person is NOT recreated
 * on retry, which would otherwise leave orphaned duplicates behind.
 */
interface Values {
  // person
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string;
  code: string;
  employeeType: string;
  workLocation: string;
  bankAccount: string;
  departmentId: string;
  jobPositionId: string;
  managerId: string;
  workingScheduleId: string;
  // contract
  reference: string;
  startDate: string;
  endDate: string;
  wage: string;
  salaryStructureId: string;
  status: string;
  notes: string;
}

const EMPTY: Values = {
  firstName: '',
  lastName: '',
  workEmail: '',
  phone: '',
  code: '',
  employeeType: 'FULL_TIME',
  workLocation: '',
  bankAccount: '',
  departmentId: '',
  jobPositionId: '',
  managerId: '',
  workingScheduleId: '',
  reference: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  wage: '',
  salaryStructureId: '',
  status: 'RUNNING',
  notes: '',
};

export function NewHireEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: (contract: any) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<Values>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  /** Set once the employee exists, so a contract retry does not duplicate them. */
  const [created, setCreated] = React.useState<any | null>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<any[]>('/departments'),
  });
  const positions = useQuery({
    queryKey: ['job-positions'],
    queryFn: () => api.get<any[]>('/job-positions'),
  });
  const schedules = useQuery({
    queryKey: ['working-schedules'],
    queryFn: () => api.get<any[]>('/working-schedules'),
  });
  const structures = useQuery({
    queryKey: ['salary-structures'],
    queryFn: () => api.get<any[]>('/salary-structures'),
  });
  const managers = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<any[]>('/employees'),
  });

  // Default the pickers to the first option once the lists land.
  React.useEffect(() => {
    if (!form.workingScheduleId && schedules.data?.length) {
      set('workingScheduleId', schedules.data[0].id);
    }
    if (!form.salaryStructureId && structures.data?.length) {
      set('salaryStructureId', structures.data[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules.data, structures.data]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = 'Required';
    if (!form.lastName.trim()) next.lastName = 'Required';
    if (!form.workEmail.trim()) next.workEmail = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail.trim()))
      next.workEmail = 'Enter a valid email address';

    if (!form.wage.trim()) next.wage = 'Required';
    else if (!(Number(form.wage) > 0)) next.wage = 'Enter an amount greater than zero';

    if (!form.startDate) next.startDate = 'Required';
    if (form.endDate && form.endDate < form.startDate)
      next.endDate = 'End date cannot precede the start date';
    if (!form.salaryStructureId) next.salaryStructureId = 'Required — payroll cannot compute without one';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const save = useMutation({
    mutationFn: async () => {
      // Step 1 — the person. Skipped if a previous attempt already made them.
      const employee =
        created ??
        (await api.post<any>('/employees', {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          workEmail: form.workEmail.trim(),
          phone: form.phone.trim() || undefined,
          code: form.code.trim() || undefined,
          employeeType: form.employeeType,
          workLocation: form.workLocation.trim() || undefined,
          bankAccount: form.bankAccount.trim() || undefined,
          departmentId: form.departmentId || undefined,
          jobPositionId: form.jobPositionId || undefined,
          managerId: form.managerId || undefined,
          workingScheduleId: form.workingScheduleId || undefined,
          isActive: true,
        }));
      setCreated(employee);

      // Step 2 — their contract.
      const contract = await api.post<any>('/contracts', {
        employeeId: employee.id,
        reference: form.reference.trim() || undefined,
        startDate: form.startDate,
        endDate: form.endDate || null,
        wage: Number(form.wage),
        status: form.status,
        departmentId: form.departmentId || employee.departmentId || undefined,
        jobPositionId: form.jobPositionId || employee.jobPositionId || undefined,
        workingScheduleId: form.workingScheduleId || employee.workingScheduleId || undefined,
        salaryStructureId: form.salaryStructureId,
        notes: form.notes.trim() || undefined,
      });

      return { employee, contract };
    },
    onSuccess: ({ contract }) => {
      for (const key of [['contracts'], ['employees'], ['dashboard']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      onSaved?.(contract);
      onClose();
    },
  });

  function submit() {
    if (validate()) save.mutate();
  }

  const wagePreview = Number(form.wage) > 0 ? money(Number(form.wage)) : null;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="New employee & contract"
      subtitle="Creates the person and their first contract together — payroll can pick them up immediately."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {created ? 'Retry contract' : 'Create employee & contract'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {/* The employee survived but the contract did not — say so plainly. */}
        {created && save.isError && (
          <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p>
              <span className="font-medium">
                {created.firstName} {created.lastName} was created
              </span>{' '}
              ({created.code}), but the contract failed. Fix the contract details below and
              retry — the employee will not be duplicated.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------- identity */}
        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <UserPlus className="h-3.5 w-3.5" />
            Employee
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required error={errors.firstName}>
              <Input
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                placeholder="Aarav"
              />
            </Field>
            <Field label="Last name" required error={errors.lastName}>
              <Input
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                placeholder="Mehta"
              />
            </Field>
            <Field label="Work email" required error={errors.workEmail}>
              <Input
                type="email"
                value={form.workEmail}
                onChange={(e) => set('workEmail', e.target.value)}
                placeholder="aarav.mehta@oxp.com"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+91 98765 43210"
              />
            </Field>
            <Field label="Employee code" hint="Left blank, the server assigns the next one.">
              <Input
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                placeholder="EMP0201"
              />
            </Field>
            <Field label="Employment type">
              <Select
                value={form.employeeType}
                onChange={(e) => set('employeeType', e.target.value)}
              >
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </Select>
            </Field>
            <Field label="Department">
              <Select
                value={form.departmentId}
                onChange={(e) => set('departmentId', e.target.value)}
              >
                <option value="">—</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Job position">
              <Select
                value={form.jobPositionId}
                onChange={(e) => set('jobPositionId', e.target.value)}
              >
                <option value="">—</option>
                {positions.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Manager">
              <Select value={form.managerId} onChange={(e) => set('managerId', e.target.value)}>
                <option value="">—</option>
                {managers.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {/* Code disambiguates people who share a name. */}
                    {m.firstName} {m.lastName} · {m.code}
                    {m.department?.name ? ` · ${m.department.name}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Work location">
              <Input
                value={form.workLocation}
                onChange={(e) => set('workLocation', e.target.value)}
                placeholder="Mumbai"
              />
            </Field>
            <Field
              label="Bank account"
              hint="Without one, payroll raises a missing-bank-account warning."
              className="sm:col-span-2"
            >
              <Input
                value={form.bankAccount}
                onChange={(e) => set('bankAccount', e.target.value)}
                placeholder="IN6011000000"
              />
            </Field>
          </div>
        </section>

        {/* ------------------------------------------------------- contract */}
        <section className="border-t border-line pt-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Contract
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Reference"
              hint="Left blank, the server generates the next CON/… number."
            >
              <Input
                value={form.reference}
                onChange={(e) => set('reference', e.target.value)}
                placeholder="CON/2026/0201"
              />
            </Field>
            <Field label="Working schedule">
              <Select
                value={form.workingScheduleId}
                onChange={(e) => set('workingScheduleId', e.target.value)}
              >
                <option value="">—</option>
                {schedules.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.hoursPerWeek}h/week)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Start date" required error={errors.startDate}>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
            </Field>
            <Field
              label="End date"
              hint="Leave empty for an open-ended contract."
              error={errors.endDate}
            >
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
            </Field>
            <Field
              label="Wage / month"
              required
              error={errors.wage}
              hint={wagePreview ? `${wagePreview} per month` : undefined}
            >
              <Input
                type="number"
                min={0}
                step={1000}
                value={form.wage}
                onChange={(e) => set('wage', e.target.value)}
                placeholder="75000"
              />
            </Field>
            <Field label="Salary structure" required error={errors.salaryStructureId}>
              <Select
                value={form.salaryStructureId}
                onChange={(e) => set('salaryStructureId', e.target.value)}
              >
                <option value="">—</option>
                {structures.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Status"
              hint="Running contracts drive payroll; only one may run at a time."
            >
              <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="RUNNING">Running</option>
                <option value="DRAFT">Draft</option>
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Anything worth recording about these terms."
              />
            </Field>
          </div>
        </section>

        {save.isError && (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {(save.error as Error).message}
          </p>
        )}
      </form>
    </Modal>
  );
}
