import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, PencilLine, Plus } from "lucide-react";
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Input,
  LoadingBlock,
  NoResults,
  PageHeader,
  SearchInput,
  StateBadge,
  Tabs,
  Td,
  Th,
  TableWrap,
  Tr,
} from "../../components/ui";
import { api, qs } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { duration, shortDate, time } from "../../lib/format";
import { useSearch } from "../../lib/search";
import { MyRequestsTable } from "./MyRequestsTable";
import { NewRequestPicker } from "./NewRequestPicker";

export function AttendancePage() {
  const [params] = useSearchParams();
  const employeeId = params.get("employeeId") ?? "";
  const { user } = useAuth();
  const [tab, setTab] = React.useState<"log" | "requests">("log");
  const [raising, setRaising] = React.useState(false);
  const mine = employeeId || user?.employeeId || "";

  const [from, setFrom] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["attendance", employeeId, from, to, page],
    queryFn: () =>
      api.get<{
        rows: any[];
        total: number;
        page: number;
        pageSize: number;
        pageCount: number;
      }>(`/attendance${qs({ employeeId, from, to, page })}`),
    placeholderData: (previous) => previous,
  });

  const rows = data?.rows ?? [];

  // Filters and date changes invalidate the current page number.
  React.useEffect(() => setPage(1), [employeeId, from, to, q]);

  const filtered = useSearch(rows, q, (row) => [
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
            {mine && (
              <Button variant="primary" onClick={() => setRaising(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Request
              </Button>
            )}
            {tab === "log" && (
            <>
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
            </>
            )}
          </div>
        }
      />

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as "log" | "requests")}
        tabs={[
          { value: "log", label: "Attendance Log" },
          { value: "requests", label: "My Requests" },
        ]}
      />

      {tab === "requests" && (
        <div className="mt-5">
          <MyRequestsTable employeeId={mine} />
        </div>
      )}

      {tab === "log" && (
      <>
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

      {data && rows.length === 0 && (
        <Card>
          <EmptyState
            icon={Clock}
            title="No attendance in this range"
            description="Widen the date range or check in from the navbar widget."
          />
        </Card>
      )}

      {data && rows.length > 0 && filtered.length === 0 && (
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
                        avatarUrl={row.employee.avatarUrl}
                        gender={row.employee.gender}
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

          {/* Pager — 50 rows a page, so a month of data stays readable. */}
          {data && data.pageCount > 1 && (
            <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                Showing{" "}
                <span className="font-medium text-ink tabular">
                  {(data.page - 1) * data.pageSize + 1}–
                  {Math.min(data.page * data.pageSize, data.total)}
                </span>{" "}
                of <span className="font-medium text-ink tabular">{data.total}</span> entries
                {q && " (search filters this page)"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </Button>
                <span className="tabular text-xs text-muted">
                  Page {data.page} of {data.pageCount}
                </span>
                <Button
                  size="sm"
                  disabled={data.page >= data.pageCount}
                  onClick={() => setPage((p) => Math.min(p + 1, data.pageCount))}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
      </>
      )}

      {raising && (
        <NewRequestPicker
          employeeId={mine}
          onClose={() => {
            setRaising(false);
            setTab("requests");
          }}
        />
      )}
    </>
  );
}
