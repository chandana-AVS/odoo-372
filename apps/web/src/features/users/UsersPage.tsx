import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert } from 'lucide-react';
import * as React from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Td,
  Th,
  TableWrap,
  Tr,
} from '../../components/ui';
import { api, qs } from '../../lib/api';
import { Role, useAuth } from '../../lib/auth';

const ROLES: Role[] = [
  'EMPLOYEE',
  'HR_MANAGER',
  'HR_PAYROLL_USER',
  'HR_PAYROLL_MANAGER',
  'ADMIN',
];

export function UsersPage() {
  const [q, setQ] = React.useState('');
  const [role, setRole] = React.useState('');
  const [editing, setEditing] = React.useState<any | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', q, role],
    queryFn: () => api.get<any[]>(`/users${qs({ q, role })}`),
  });

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Accounts are created here, linked to an employee, and granted roles."
        action={
          <Button variant="primary" onClick={() => setEditing({ roles: ['EMPLOYEE'] })}>
            <Plus className="h-3.5 w-3.5" />
            New User
          </Button>
        }
      />

      <div className="mb-5 flex items-center gap-2 rounded-xl border border-warn/25 bg-warn/5 px-4 py-2.5 text-xs">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warn" />
        Users cannot assign or elevate their own roles — the API rejects it.
      </div>

      <Card className="mb-5 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <SearchInput
            value={q}
            onChange={setQ}
            count={data?.length}
            placeholder="Search users, employees or email…"
            className="sm:col-span-2"
          />
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((name) => (
              <option key={name} value={name}>
                {name.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={5} />}

      {data && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Employee</Th>
                <Th>Work Email</Th>
                <Th>Roles</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((user) => (
                <Tr key={user.id} onClick={() => setEditing(mapUser(user))}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        firstName={user.employee?.firstName ?? user.email}
                        lastName={user.employee?.lastName}
                        size="sm"
                      />
                      <span className="truncate font-medium">
                        {user.employee
                          ? `${user.employee.firstName} ${user.employee.lastName}`
                          : user.email.split('@')[0]}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-muted tabular">{user.employee?.code ?? '—'}</Td>
                  <Td className="text-muted">{user.email}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((ur: any) => (
                        <Badge key={ur.role.id} tone="brand">
                          {ur.role.name.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td align="right">
                    <Badge tone={user.isActive ? 'ok' : 'neutral'} dot>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {editing && <UserEditor user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const mapUser = (user: any) => ({
  id: user.id,
  email: user.email,
  employeeId: user.employeeId ?? '',
  isActive: user.isActive,
  roles: user.roles.map((ur: any) => ur.role.name),
});

function UserEditor({ user, onClose }: { user: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user: current } = useAuth();
  const isSelf = user.id === current?.id;

  const [form, setForm] = React.useState({
    email: user.email ?? '',
    password: '',
    employeeId: user.employeeId ?? '',
    isActive: user.isActive ?? true,
    roles: (user.roles ?? []) as Role[],
  });

  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<any[]>('/employees'),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload: any = {
        email: form.email,
        employeeId: form.employeeId || null,
        isActive: form.isActive,
      };
      if (form.password) payload.password = form.password;
      // Never send a role change for your own account — the API refuses it.
      if (!isSelf) payload.roles = form.roles;
      return user.id ? api.patch(`/users/${user.id}`, payload) : api.post('/users', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  const toggleRole = (role: Role) =>
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));

  return (
    <Modal
      open
      onClose={onClose}
      title={user.id ? 'Edit user' : 'Create user'}
      subtitle="Link the account to an employee and assign one or more roles."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save user
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Work Email" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="name@company.com"
          />
        </Field>

        <Field
          label="Password"
          hint={user.id ? 'Leave blank to keep the current password.' : 'Defaults to welcome123.'}
        >
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
          />
        </Field>

        <Field label="Employee" hint="Controls which records this account can see.">
          <Select
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          >
            <option value="">Select employee</option>
            {employees.data?.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName} · {employee.code}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Roles</p>
          {isSelf ? (
            <p className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-warn">
              You cannot change your own roles.
            </p>
          ) : (
            <div className="space-y-2 rounded-lg border border-line p-3">
              {ROLES.map((role) => (
                <Checkbox
                  key={role}
                  checked={form.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  label={role.replace(/_/g, ' ')}
                />
              ))}
            </div>
          )}
        </div>

        <Checkbox
          checked={form.isActive}
          onChange={(isActive) => setForm({ ...form, isActive })}
          label="Account is active"
        />

        {save.isError && (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {(save.error as Error).message}
          </p>
        )}
      </div>
    </Modal>
  );
}
