import { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import { tasksApi, type Task, type TaskListParams } from "@mobile/api/tasks";
import {
  STATUS_COLORS,
  STATUS_LABELS,
} from "@tusker/core/lib/colors/status-colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { qk, useOnline } from "~/lib/query";
import { useWorkspace } from "~/providers/WorkspaceProvider";

type Status = keyof typeof STATUS_COLORS;
const STATUSES = Object.keys(STATUS_COLORS) as Status[];

/**
 * A page of tasks from GET /tasks (the route every web task view uses), with an
 * inline status change. The server applies the same transition rules as on the
 * website and mobile app, so a refused move shows its message here.
 */
export function TaskList({
  params,
  pageSize = 20,
  emptyText = "No tasks here.",
}: {
  params: Omit<TaskListParams, "workspaceId" | "cursor" | "limit">;
  pageSize?: number;
  emptyText?: string;
}) {
  const { workspaceId, layout } = useWorkspace();
  const projectNames = useMemo(
    () => new Map((layout?.projects ?? []).map((p) => [p.id, p.name])),
    [layout?.projects],
  );

  const query = useInfiniteQuery({
    queryKey: qk.tasks(workspaceId, { list: params, pageSize }),
    initialPageParam: null as TaskListParams["cursor"],
    queryFn: ({ pageParam }) =>
      tasksApi.list({
        workspaceId,
        viewMode: "list",
        limit: pageSize,
        cursor: pageParam,
        ...params,
      }),
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
  });
  const tasks = (query.data?.pages ?? []).flatMap((p) => p.tasks);

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (query.isError && tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        {(query.error as Error).message}
      </p>
    );
  }
  if (tasks.length === 0)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </p>
    );

  return (
    <div className="flex flex-col gap-2">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          projectName={task.project?.name ?? projectNames.get(task.projectId)}
        />
      ))}
      {query.hasNextPage && (
        <Button
          variant="ghost"
          className="self-center"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage && (
            <Loader2 className="size-4 animate-spin" />
          )}{" "}
          Load more
        </Button>
      )}
    </div>
  );
}

function TaskRow({ task, projectName }: { task: Task; projectName?: string }) {
  const { workspaceId } = useWorkspace();
  const online = useOnline();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      tasksApi.setStatus(
        task.id,
        { workspaceId, projectId: task.projectId },
        status,
      ),
    onMutate: () => setError(null),
    onError: (e: Error) => setError(e.message),
    // Pusher would refetch too; this makes our own change show immediately.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      qc.invalidateQueries({ queryKey: qk.reviews(workspaceId) });
    },
  });

  const status = (task.status ?? "TO_DO") as Status;
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const overdue =
    due &&
    due < new Date(new Date().setHours(0, 0, 0, 0)) &&
    status !== "COMPLETED" &&
    status !== "CANCELLED";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-card px-4 py-3 shadow-xs">
      <div className="min-w-0 flex-1 basis-60">
        <p className="truncate text-sm font-medium">{task.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[projectName, task.parentTask?.name].filter(Boolean).join(" · ") ||
            "No project"}
        </p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      {due && (
        <span
          className={cn(
            "flex items-center gap-1 text-xs",
            overdue ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          <CalendarDays className="size-3.5" />
          {format(due, "d MMM")}
        </span>
      )}
      <Select
        value={status}
        onValueChange={(s) => setStatus.mutate(s)}
        disabled={!online || setStatus.isPending}
      >
        <SelectTrigger
          size="sm"
          title={online ? "Change status" : "Changes need a connection"}
          className={cn(
            "w-36 text-xs font-medium",
            STATUS_COLORS[status]?.color,
            STATUS_COLORS[status]?.bgColor,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
