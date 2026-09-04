"use client";

import { useEffect, useState } from "react";
import { CheckSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toDateOnlyString } from "@/lib/date-utils";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { useWorkspaceLayout } from "./workspace-layout-context";

type Range = "today" | "week";

interface TaskRow {
  id: string;
  name: string;
  taskSlug?: string | null;
  dueDate?: string | null;
  status?: string | null;
  projectId?: string | null;
}

const statusColorMap: Record<string, string> = {
  TO_DO: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  REVIEW: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  HOLD: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

/** Anything not finished or dropped is still owed — that is what "pending" means here. */
const isPending = (status?: string | null) => status !== "COMPLETED" && status !== "CANCELLED";

/** Delayed = still pending and its due date has already passed. Due today is not late yet. */
const isDelayed = (task: TaskRow) =>
  isPending(task.status) &&
  !!task.dueDate &&
  toDateOnlyString(new Date(task.dueDate)) < toDateOnlyString(new Date());

/** Local start of today, and the end of the current week (Sun-Sat). */
function rangeFor(range: Range) {
  const start = new Date();
  const end = new Date();

  if (range === "week") {
    // Sunday to Saturday, so work already overdue earlier this week still shows.
    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()));
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/** Delayed first, then still-pending work, then the ones due soonest. */
function byUrgency(a: TaskRow, b: TaskRow) {
  const delayed = Number(isDelayed(b)) - Number(isDelayed(a));
  if (delayed !== 0) return delayed;
  const pending = Number(isPending(b.status)) - Number(isPending(a.status));
  if (pending !== 0) return pending;
  return new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime();
}

/**
 * Tasks the current user is allowed to see (the /tasks API scopes by workspace
 * and project role), due today or within the rest of this week.
 */
export function MyTasksWidget({ workspaceId }: { workspaceId: string }) {
  const { openSubTaskSheet } = useSubTaskSheet();
  // The list view returns project ids only; names come from the layout payload.
  const { data: layoutData } = useWorkspaceLayout();
  const [range, setRange] = useState<Range>("today");
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);

  useEffect(() => {
    let active = true;
    const { start, end } = rangeFor(range);
    const params = new URLSearchParams({
      w: workspaceId,
      vm: "list",
      l: "25",
      da: start.toISOString(),
      db: end.toISOString(),
      sub: "false",
    });

    fetch(`/api/v1/tasks?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        const rows: TaskRow[] = json?.success ? json.data?.tasks ?? [] : [];
        setTasks([...rows].sort(byUrgency));
      })
      .catch(() => active && setTasks([]));

    return () => {
      active = false;
    };
  }, [workspaceId, range]);

  const todayKey = toDateOnlyString(new Date());
  const delayedCount = (tasks ?? []).filter(isDelayed).length;
  const projectNames = new Map<string, string>(
    (layoutData?.projects ?? []).map((p: any) => [p.id, p.name])
  );

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            My Tasks
          </h3>
          <span className="text-xs text-muted-foreground">
            {range === "today" ? "Due today" : "Due this week"}
            {delayedCount > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                {" "}
                · {delayedCount} delayed
              </span>
            )}
          </span>
        </div>
        <div className="p-1.5 rounded-xl bg-primary/10 text-primary">
          <CheckSquare className="size-4.5" />
        </div>
      </div>

      <div className="flex items-center p-1 rounded-xl bg-muted border text-xs mb-4 w-fit">
        {(["today", "week"] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              if (r === range) return;
              setTasks(null);
              setRange(r);
            }}
            className={cn(
              "px-3 py-1 rounded-lg font-semibold capitalize transition-all",
              range === r
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {r === "today" ? "Today" : "This Week"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto max-h-[320px] pr-1">
        {tasks === null ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">
            {range === "today" ? "No tasks due today" : "No tasks due this week"}
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const dueKey = task.dueDate ? toDateOnlyString(new Date(task.dueDate)) : null;
              const delayed = isDelayed(task);

              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-full border px-6 py-3",
                    delayed
                      ? "border-rose-500/60 bg-rose-500/5"
                      : "border-border bg-muted/30"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openSubTaskSheet(task)}
                    className={cn(
                      "text-sm font-medium truncate block text-left w-full hover:underline transition-colors",
                      delayed
                        ? "text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300"
                        : "text-foreground hover:text-primary"
                    )}
                  >
                    {task.name}
                  </button>
                  <div className="flex items-center flex-wrap gap-2 mt-1.5">
                    {task.status && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] py-0 px-1.5",
                          delayed
                            ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800"
                            : statusColorMap[task.status] || ""
                        )}
                      >
                        {task.status.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {task.dueDate && (
                      <span
                        className={cn(
                          "text-[11px]",
                          delayed
                            ? "text-rose-600 dark:text-rose-400 font-semibold"
                            : dueKey === todayKey
                            ? "text-amber-500 font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {delayed
                          ? `Delayed - ${new Date(task.dueDate).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}`
                          : dueKey === todayKey
                          ? "Due today"
                          : new Date(task.dueDate).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                      </span>
                    )}
                    {task.projectId && projectNames.get(task.projectId) && (
                      <span className="text-[11px] text-muted-foreground/70 truncate">
                        {projectNames.get(task.projectId)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
