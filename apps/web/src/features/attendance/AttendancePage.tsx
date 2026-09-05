import { useQuery } from "@tanstack/react-query";
import { Clock, PencilLine } from "lucide-react";
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorBlock,
  Input,
  LoadingBlock,
  NoResults,
  PageHeader,
  SearchInput,
  StateBadge,
  Td,
  Th,
  TableWrap,
  Tr,
} from "../../components/ui";
import { api, qs } from "../../lib/api";
import { duration, shortDate, time } from "../../lib/format";
import { useSearch } from "../../lib/search";

export function AttendancePage() {
  const [params] = useSearchParams();
  const employeeId = params.get("employeeId") ?? "";

  const [from, setFrom] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [q, setQ] = React.useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["attendance", employeeId, from, to],
    queryFn: () => api.get<any[]>(`/attendance${qs({ employeeId, from, to })}`),
  });

  const filtered = useSearch(data, q, (row) => [
    row.employee,
    row.status,
    shortDate(row.date),
    time(row.checkIn),
    row.checkOut ? time(row.checkOut) : "still open",
    row.isManualEdit ? "manual edit" : "",
  ]);

  // The stat cards describe what is on screen, so they follow the search too.
  const totals = React.useMemo(() => {
    const rows = filtered;
    return {
      entries: rows.length,
      hours: Math.round(
        rows.reduce((sum, row) => sum + Number(row.workedHours), 0),
      ),
      exceptions: rows.filter((row) =>
        ["LATE", "ABSENT", "MISSING_CHECKOUT"].includes(row.status),
      ).length,
      edits: rows.filter((row) => row.isManualEdit).length,
    };
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={
          employeeId
            ? "Filtered to one employee."
            : "Log-in, Log-out and worked hours — the basis for payroll proration."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={setQ}
              count={filtered.length}
              placeholder="Search employee or status…"
              className="w-full sm:w-64"
            />
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-36"
            />
            <span className="text-xs text-muted">to</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-36"
            />
          </div>
        }
      />

      {/* Quick stats */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Entries", totals.entries],
          ["Hours logged", `${totals.hours}h`],
          ["Exceptions", totals.exceptions],
          ["Manual edits", totals.edits],
        ].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
              {label as string}
            </p>
            <p className="mt-1 text-xl font-semibold tabular">
              {value as React.ReactNode}
            </p>
          </Card>
        ))}
      </div>

      {error && <ErrorBlock error={error} />}
      {isLoading && <LoadingBlock rows={8} />}

      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={Clock}
            title="No attendance in this range"
            description="Widen the date range or check in from the navbar widget."
          />
        </Card>
      )}

      {data && data.length > 0 && filtered.length === 0 && (
        <Card>
          <NoResults query={q} onClear={() => setQ("")} noun="entries" />
        </Card>
      )}

      {filtered.length > 0 && (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Date</Th>
                <Th>Log In</Th>
                <Th>Log Out</Th>
                <Th align="right">Worked Hours</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        firstName={row.employee.firstName}
                        lastName={row.employee.lastName}
                        size="sm"
                      />
                      <span className="truncate">
                        {row.employee.firstName} {row.employee.lastName}
                      </span>
                    </div>
                  </Td>
                  <Td className="tabular text-muted">{shortDate(row.date)}</Td>
                  <Td className="tabular">{time(row.checkIn)}</Td>
                  <Td className="tabular">
                    {row.checkOut ? (
                      time(row.checkOut)
                    ) : (
                      <span className="text-warn">Still open</span>
                    )}
                  </Td>
                  <Td align="right" className="font-medium tabular">
                    {Number(row.workedHours) > 0
                      ? duration(Number(row.workedHours) * 60)
                      : "—"}
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1.5">
                      {row.isManualEdit && (
                        <span title="Manually corrected">
                          <PencilLine className="h-3.5 w-3.5 text-warn" />
                        </span>
                      )}
                      <StateBadge state={row.status} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
