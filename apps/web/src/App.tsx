import { Navigate, Route, Routes } from 'react-router-dom';
import { Card, EmptyState, Spinner } from './components/ui';
import { AttendancePage } from './features/attendance/AttendancePage';
import { LoginPage } from './features/auth/LoginPage';
import { ContractDetailPage, ContractsPage } from './features/contracts/ContractsPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { EmployeeDetailPage } from './features/employees/EmployeeDetailPage';
import { EmployeesPage } from './features/employees/EmployeesPage';
import {
  PayrunsPage,
  PayslipsPage,
  SalaryRulesPage,
} from './features/payroll/PayrollListPages';
import { PayrunDetailPage } from './features/payroll/PayrunDetailPage';
import { PayrunWizard } from './features/payroll/PayrunWizard';
import { PayslipDetailPage } from './features/payroll/PayslipDetailPage';
import {
  StructureDetailPage,
  StructuresPage,
} from './features/payroll/StructuresPage';
import { SchedulesPage } from './features/schedules/SchedulesPage';
import {
  AllocationsPage,
  TimeOffRequestsPage,
  TimeOffTypesPage,
} from './features/timeoff/TimeOffPages';
import { UsersPage } from './features/users/UsersPage';
import { AppShell } from './layouts/AppShell';
import { PAYROLL_ROLES, Role, useAuth } from './lib/auth';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Route-level RBAC — mirrors the guards on the API. */
function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(...roles)) {
    return (
      <Card>
        <EmptyState
          title="You don't have access to this area"
          description="Ask an administrator to grant your account the required role."
        />
      </Card>
    );
  }
  return <>{children}</>;
}

/** Employees land on their own record; everyone else on the dashboard. */
function Home() {
  const { can, user } = useAuth();
  if (can(...PAYROLL_ROLES)) return <Navigate to="/payroll/dashboard" replace />;
  if (user?.employeeId) return <Navigate to={`/employees/${user.employeeId}`} replace />;
  return <Navigate to="/employees" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<Home />} />

        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />

        <Route path="contracts" element={<ContractsPage />} />
        <Route path="contracts/:id" element={<ContractDetailPage />} />
        <Route path="schedules" element={<SchedulesPage />} />

        <Route path="attendance" element={<AttendancePage />} />

        <Route path="time-off/requests" element={<TimeOffRequestsPage />} />
        <Route path="time-off/allocations" element={<AllocationsPage />} />
        <Route path="time-off/types" element={<TimeOffTypesPage />} />

        <Route
          path="payroll/*"
          element={
            <RequireRole roles={PAYROLL_ROLES}>
              <Routes>
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="payruns" element={<PayrunsPage />} />
                <Route path="payruns/new" element={<PayrunWizard />} />
                <Route path="payruns/:id" element={<PayrunDetailPage />} />
                <Route path="payslips" element={<PayslipsPage />} />
                <Route path="payslips/:id" element={<PayslipDetailPage />} />
                <Route path="structures" element={<StructuresPage />} />
                <Route path="structures/:id" element={<StructureDetailPage />} />
                <Route path="rules" element={<SalaryRulesPage />} />
              </Routes>
            </RequireRole>
          }
        />

        <Route
          path="admin/users"
          element={
            <RequireRole roles={['ADMIN']}>
              <UsersPage />
            </RequireRole>
          }
        />

        <Route
          path="*"
          element={
            <Card>
              <EmptyState title="Page not found" description="Check the URL and try again." />
            </Card>
          }
        />
      </Route>
    </Routes>
  );
}
