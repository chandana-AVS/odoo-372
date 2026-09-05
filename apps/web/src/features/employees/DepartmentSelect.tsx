import { CreatableSelect } from '../../components/CreatableSelect';

/** Department picker with inline creation. See {@link CreatableSelect}. */
export function DepartmentSelect({
  value,
  onChange,
  canCreate = true,
  disabled,
}: {
  value: string;
  onChange: (departmentId: string) => void;
  canCreate?: boolean;
  disabled?: boolean;
}) {
  return (
    <CreatableSelect
      value={value}
      onChange={onChange}
      canCreate={canCreate}
      disabled={disabled}
      queryKey="departments"
      endpoint="/departments"
      placeholder="Select department"
      addLabel="+ Other — add new department…"
      inputPlaceholder="e.g. Quality Assurance"
    />
  );
}

/** Job position picker with inline creation. */
export function JobPositionSelect({
  value,
  onChange,
  canCreate = true,
  disabled,
}: {
  value: string;
  onChange: (jobPositionId: string) => void;
  canCreate?: boolean;
  disabled?: boolean;
}) {
  return (
    <CreatableSelect
      value={value}
      onChange={onChange}
      canCreate={canCreate}
      disabled={disabled}
      queryKey="job-positions"
      endpoint="/job-positions"
      placeholder="Select job position"
      addLabel="+ Other — add new position…"
      inputPlaceholder="e.g. Data Engineer"
    />
  );
}
