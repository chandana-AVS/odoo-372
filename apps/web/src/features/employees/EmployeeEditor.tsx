import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  PhoneInput,
  Select,
  TextInput,
} from "../../components/ui";
import { api } from "../../lib/api";
import { phoneError } from "../../lib/format";
import { DepartmentSelect, JobPositionSelect } from "./DepartmentSelect";
import { ScheduleSelect } from "../schedules/ScheduleSelect";

export interface EmployeeFormValues {
  id?: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  code: string;
  departmentId: string;
  jobPositionId: string;
  managerId: string;
  workingScheduleId: string;
  employeeType: string;
  gender: string;
  workLocation: string;
  bankAccount: string;
  isActive: boolean;
}

const EMPTY: EmployeeFormValues = {
  firstName: "",
  lastName: "",
  workEmail: "",
  personalEmail: "",
  phone: "",
  code: "",
  departmentId: "",
  jobPositionId: "",
  managerId: "",
  workingScheduleId: "",
  employeeType: "FULL_TIME",
  gender: "UNDISCLOSED",
  workLocation: "",
  bankAccount: "",
  isActive: true,
};

/** Maps an API employee record onto the form shape. */
export function toFormValues(employee: any): EmployeeFormValues {
  return {
    id: employee.id,
    firstName: employee.firstName ?? "",
    lastName: employee.lastName ?? "",
    workEmail: employee.workEmail ?? "",
    personalEmail: employee.personalEmail ?? "",
    phone: employee.phone ?? "",
    code: employee.code ?? "",
    departmentId: employee.departmentId ?? employee.department?.id ?? "",
    jobPositionId: employee.jobPositionId ?? employee.jobPosition?.id ?? "",
    managerId: employee.managerId ?? employee.manager?.id ?? "",
    workingScheduleId:
      employee.workingScheduleId ?? employee.workingSchedule?.id ?? "",
    employeeType: employee.employeeType ?? "FULL_TIME",
    gender: employee.gender ?? "UNDISCLOSED",
    workLocation: employee.workLocation ?? "",
    bankAccount: employee.bankAccount ?? "",
    isActive: employee.isActive ?? true,
  };
}

export function EmployeeEditor({
  employee,
  onClose,
  onSaved,
}: {
  /** Pass an existing record to edit, or nothing to create. */
  employee?: any;
  onClose: () => void;
  onSaved?: (saved: any) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(employee?.id);

  const [form, setForm] = React.useState<EmployeeFormValues>(
    employee ? toFormValues(employee) : EMPTY,
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = <K extends keyof EmployeeFormValues>(
    key: K,
    value: EmployeeFormValues[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  // Only people flagged as managers — otherwise this lists the whole company.
  const managers = useQuery({
    queryKey: ["employees", "managers"],
    queryFn: () => api.get<any[]>("/employees?managersOnly=true"),
  });

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = "Required";
    if (!form.lastName.trim()) next.lastName = "Required";
    if (!form.workEmail.trim()) next.workEmail = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail.trim()))
      next.workEmail = "Enter a valid email address";
    if (
      form.personalEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personalEmail)
    )
      next.personalEmail = "Enter a valid email address";

    const phoneProblem = phoneError(form.phone);
    if (phoneProblem) next.phone = phoneProblem;

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const save = useMutation({
    mutationFn: () => {
      const { id, ...payload } = form;
      // The server generates the code when it is left blank.
      const body = { ...payload, code: payload.code.trim() || undefined };
      return isEdit
        ? api.patch<any>(`/employees/${id}`, body)
        : api.post<any>("/employees", body);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee", saved.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved?.(saved);
      onClose();
    },
  });

  function submit() {
    if (validate()) save.mutate();
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={
        isEdit ? `Edit ${form.firstName} ${form.lastName}` : "New employee"
      }
      subtitle={
        isEdit
          ? "Changes apply immediately; payroll uses these on the next compute."
          : "Create the employee record, then give them a contract to make payroll possible."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {isEdit ? "Save changes" : "Create employee"}
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
        {/* ------------------------------------------------------- identity */}
        <section>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Identity
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First Name" required error={errors.firstName}>
              <TextInput
                value={form.firstName}
                onChange={(value) => set("firstName", value)}
                placeholder="Aarav"
                autoFocus
              />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <TextInput
                value={form.lastName}
                onChange={(value) => set("lastName", value)}
                placeholder="Mehta"
              />
            </Field>
            <Field label="Work Email" required error={errors.workEmail}>
              <Input
                type="email"
                value={form.workEmail}
                onChange={(e) => set("workEmail", e.target.value)}
                placeholder="aarav.mehta@oxp.com"
              />
            </Field>
            <Field
              label="Employee Code"
              hint={
                isEdit
                  ? "Codes are fixed once assigned."
                  : "Leave blank to auto-generate."
              }
            >
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                // placeholder="EMP0023"
                disabled={isEdit}
              />
            </Field>
          </div>
        </section>

        {/* ------------------------------------------------------ work info */}
        <section>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Work Information
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department">
              <DepartmentSelect
                value={form.departmentId}
                onChange={(id) => set("departmentId", id)}
              />
            </Field>

            <Field label="Job Position">
              <JobPositionSelect
                value={form.jobPositionId}
                onChange={(id) => set("jobPositionId", id)}
              />
            </Field>

            <Field label="Manager">
              <Select
                value={form.managerId}
                onChange={(e) => set("managerId", e.target.value)}
              >
                <option value="">No manager</option>
                {managers.data
                  ?.filter((candidate) => candidate.id !== form.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {/* Code disambiguates people who share a name. */}
                      {candidate.firstName} {candidate.lastName} ·{" "}
                      {candidate.code}
                      {candidate.department?.name
                        ? ` · ${candidate.department.name}`
                        : ""}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field
              label="Working Schedule"
              hint="Sets the expected hours attendance and payroll compare against."
            >
              <ScheduleSelect
                value={form.workingScheduleId}
                onChange={(id) => set("workingScheduleId", id)}
              />
            </Field>

            <Field label="Employee Type" required>
              <Select
                value={form.employeeType}
                onChange={(e) => set("employeeType", e.target.value)}
              >
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </Select>
            </Field>

            <Field label="Work Location">
              <TextInput
                value={form.workLocation}
                onChange={(value) => set("workLocation", value)}
                placeholder="Mumbai"
              />
            </Field>
          </div>
        </section>

        {/* --------------------------------------------------------- private */}
        <section>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Private Information
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Personal Email" error={errors.personalEmail}>
              <Input
                type="email"
                value={form.personalEmail}
                onChange={(e) => set("personalEmail", e.target.value)}
              />
            </Field>
            <Field label="Gender" hint="Sets the default avatar. Optional.">
              <Select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
              >
                <option value="UNDISCLOSED">Prefer not to say</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Phone" error={errors.phone}>
              <PhoneInput
                value={form.phone}
                onChange={(value) => set("phone", value)}
                placeholder="+91 98765 43210"
              />
            </Field>
            <Field
              label="Bank Account"
              className="sm:col-span-2"
              hint="Leave blank and payroll will flag a “missing bank account” warning."
            >
              <Input
                value={form.bankAccount}
                onChange={(e) => set("bankAccount", e.target.value)}
                placeholder="IN6011000000"
              />
            </Field>
          </div>
        </section>

        <Checkbox
          checked={form.isActive}
          onChange={(isActive) => set("isActive", isActive)}
          label="Employee is active"
        />

        {save.isError && (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {(save.error as Error).message}
          </p>
        )}

        {/* Lets Enter submit the form. */}
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}
