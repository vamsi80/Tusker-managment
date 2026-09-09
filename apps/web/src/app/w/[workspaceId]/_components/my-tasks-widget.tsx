"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CheckSquare, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toDateOnlyString } from "@tusker/core/lib/date-utils";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { useWorkspaceLayout } from "./workspace-layout-context";

type Range = "delayed" | "today" | "week";
type SortDir = "asc" | "desc";

/** One page. Small on purpose — the rest arrives via Load more. */
const PAGE_SIZE = 10;

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

/** Local midnight, `offsetDays` from today, as the API's date bound. */
function midnight(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Each tab is its own server-side query. The widget used to fetch one flat page
 * of 200 and slice all three tabs out of it client-side — with ~850 tasks in
 * range that quietly dropped whole projects before the browser ever saw them.
 * `db` is exclusive of the following day, so a bound of midnight(n) includes
 * all of day n.
 */
function rangeParams(range: Range): Record<string, string> {
  if (range === "delayed") return { db: midnight(-1) };
  if (range === "today") return { da: midnight(0), db: midnight(0) };
  return { da: midnight(0), db: midnight(6) };
}

export function MyTasksWidget({ workspaceId }: { workspaceId: string }) {
  const { openSubTaskSheet } = useSubTaskSheet();
  // The list view returns project ids only; names come from the layout payload.
  const { data: layoutData } = useWorkspaceLayout();

  const [range, setRange] = useState<Range>("today");
  /** Delayed only: oldest-overdue first by default, which is the worst first. */
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [cursor, setCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Bumped on every reset so a slow first page cannot land after a tab switch
  // and repaint the tab the user has already left.
  const requestId = useRef(0);

  const direction: SortDir = range === "delayed" ? sortDir : "asc";

  const load = useCallback(
    async (nextCursor: any, token: number) => {
      const params = new URLSearchParams({
        w: workspaceId,
        vm: "list",
        l: String(PAGE_SIZE),
        sub: "false",
        sorts: JSON.stringify([{ field: "dueDate", direction }]),
        ...rangeParams(range),
      });
      if (nextCursor) params.set("c", JSON.stringify(nextCursor));

      try {
        const res = await fetch(`/api/v1/tasks?${params.toString()}`);
        const json = await res.json();
        if (token !== requestId.current) return;

        const rows: TaskRow[] = json?.success ? json.data?.tasks ?? [] : [];
        setTasks((prev) => (nextCursor ? [...(prev ?? []), ...rows] : rows));
        setCursor(json?.data?.nextCursor ?? null);
        setHasMore(Boolean(json?.data?.hasMore));
      } catch {
        if (token !== requestId.current) return;
        setTasks((prev) => prev ?? []);
        setHasMore(false);
      }
    },
    [workspaceId, range, direction],
  );

  // First page whenever the tab, the sort or the workspace changes.
  useEffect(() => {
    const token = ++requestId.current;
    setTasks(null);
    setCursor(null);
    setHasMore(false);
    load(null, token);
  }, [load]);

  const loadMore = async () => {
    if (!hasMore || isLoadingMore || !cursor) return;
    setIsLoadingMore(true);
    await load(cursor, requestId.current);
    setIsLoadingMore(false);
  };

  const todayKey = toDateOnlyString(new Date());
  // An owner's /tasks call already returns the whole workspace, so only the
  // label is wrong for them — it was never "my" tasks.
  const isOwner = layoutData?.permissions?.workspaceRole === "OWNER";
  const projectNames = new Map<string, string>(
    (layoutData?.projects ?? []).map((p: any) => [p.id, p.name]),
  );

  const emptyText =
    range === "delayed"
      ? "Nothing overdue"
      : range === "today"
        ? "No tasks due today"
        : "No tasks due in the next 7 days";

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {isOwner ? "All Tasks" : "My Tasks"}
          </h3>
          <span className="text-xs text-muted-foreground">
            {range === "delayed" ? "Past due" : range === "today" ? "Due today" : "Due in next 7 days"}
          </span>
        </div>
        <div className="p-1.5 rounded-xl bg-primary/10 text-primary">
          <CheckSquare className="size-4.5" />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center p-1 rounded-xl bg-muted border text-xs w-fit">
          {(["delayed", "today", "week"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1 rounded-lg font-semibold transition-all",
                range === r
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r === "delayed" ? "Delayed" : r === "today" ? "Today" : "Next 7 Days"}
            </button>
          ))}
        </div>

        {/* Only Delayed spans an open-ended stretch of the past, so it is the
            only tab where which end you start from is a real question. */}
        {range === "delayed" && (
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title={sortDir === "asc" ? "Oldest overdue first" : "Most recently overdue first"}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl border bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {sortDir === "asc" ? (
              <ArrowUpNarrowWide className="size-3.5" />
            ) : (
              <ArrowDownWideNarrow className="size-3.5" />
            )}
            {sortDir === "asc" ? "Oldest" : "Newest"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto max-h-[320px] pr-1">
        {tasks === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-full border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const dueKey = task.dueDate ? toDateOnlyString(new Date(task.dueDate)) : null;
              const delayed = range === "delayed";

              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-full border px-6 py-3",
                    delayed ? "border-rose-500/60 bg-rose-500/5" : "border-border bg-muted/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openSubTaskSheet(task)}
                    className={cn(
                      "text-sm font-medium truncate block text-left w-full hover:underline transition-colors",
                      delayed
                        ? "text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300"
                        : "text-foreground hover:text-primary",
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
                            : statusColorMap[task.status] || "",
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
                              : "text-muted-foreground",
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

            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="w-full rounded-full border border-dashed py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
                {isLoadingMore ? "Loading…" : `Load ${PAGE_SIZE} more`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
