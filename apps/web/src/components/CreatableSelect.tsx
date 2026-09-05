import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import * as React from 'react';
import { Button, Select, TextInput } from './ui';
import { api } from '../lib/api';

/** Sentinel option value — picking it swaps the select for a name field. */
const ADD_NEW = '__add_new__';

interface Option {
  id: string;
  name: string;
}

/**
 * A dropdown with an inline "Other — add new…" option, so a form is never
 * blocked by a missing lookup value.
 *
 * The new record is created immediately, selected, and the shared query is
 * invalidated so every other open picker sees it too. Used for departments and
 * job positions; anything with an `{ id, name }` shape fits.
 */
export function CreatableSelect({
  value,
  onChange,
  queryKey,
  endpoint,
  placeholder,
  addLabel,
  inputPlaceholder,
  canCreate = true,
  disabled,
  /** Extra fields sent alongside `name` when creating. */
  createExtras,
}: {
  value: string;
  onChange: (id: string) => void;
  queryKey: string;
  endpoint: string;
  placeholder: string;
  addLabel: string;
  inputPlaceholder: string;
  canCreate?: boolean;
  disabled?: boolean;
  createExtras?: Record<string, unknown>;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const options = useQuery({
    queryKey: [queryKey],
    queryFn: () => api.get<Option[]>(endpoint),
  });

  React.useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const create = useMutation({
    mutationFn: () =>
      api.post<Option>(endpoint, { name: name.trim(), ...(createExtras ?? {}) }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      onChange(created.id);
      setName('');
      setAdding(false);
    },
  });

  const cancel = () => {
    setName('');
    setAdding(false);
    create.reset();
  };

  const submit = () => {
    if (name.trim()) create.mutate();
  };

  if (adding) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <TextInput
            ref={inputRef}
            value={name}
            onChange={setName}
            placeholder={inputPlaceholder}
            onKeyDown={(e) => {
              // Enter must not submit the surrounding form.
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
          />
          <Button
            variant="primary"
            size="sm"
            loading={create.isPending}
            disabled={!name.trim()}
            onClick={submit}
          >
            <Check className="h-3.5 w-3.5" />
            Add
          </Button>
          <Button size="sm" onClick={cancel} aria-label="Cancel">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        {create.isError && (
          <p className="text-[11px] text-danger">{(create.error as Error).message}</p>
        )}
      </div>
    );
  }

  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === ADD_NEW) setAdding(true);
        else onChange(e.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {options.data?.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
      {canCreate && <option value={ADD_NEW}>{addLabel}</option>}
    </Select>
  );
}
