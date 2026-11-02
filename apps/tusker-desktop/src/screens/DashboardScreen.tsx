import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tasksApi } from "@mobile/api/tasks";
import { cn } from "@/lib/utils";
import { qk } from "~/lib/query";
import { useUser } from "~/providers/AuthProvider";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { TaskList } from "~/components/TaskList";

const ACTIVE = ["TO_DO", "IN_PROGRESS", "REVIEW"];
type Range = "delayed" | "today" | "week";

const midnight = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
};

/** rangeParams in the website's my-tasks-widget.tsx: each tab is its own server query. */
const rangeParams = (range: Range) =>
    range === "delayed"
        ? { dueBefore: midnight(-1) }
        : range === "today"
          ? { dueAfter: midnight(0), dueBefore: midnight(0) }
          : { dueAfter: midnight(0), dueBefore: midnight(6) };

export function DashboardScreen() {
    const user = useUser();
    const { workspaceId } = useWorkspace();
    const [range, setRange] = useState<Range>("today");
    const reviews = useQuery({ queryKey: qk.reviews(workspaceId), queryFn: () => tasksApi.pendingReviews(workspaceId) });

    return (
        <>
            <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Hello, {user.surname || user.name}</h1>
                <p className="mt-1 text-sm text-foreground/80">Your tasks and reviews, live from Tusker.</p>
            </div>

            {/* Same grid as the website dashboard: columns from the space, never squeezed. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] items-start gap-6 [&>*]:min-w-0">
                <section className="surface flex flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-base font-semibold">My Tasks</h2>
                        <div className="flex rounded-full bg-muted p-1 text-xs">
                            {(["delayed", "today", "week"] as Range[]).map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setRange(r)}
                                    className={cn(
                                        "rounded-full px-3 py-1 font-semibold capitalize",
                                        range === r ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                    <TaskList
                        params={{ own: true, includeSubTasks: false, status: ACTIVE, sorts: [{ field: "dueDate", direction: "asc" }], ...rangeParams(range) }}
                        pageSize={10}
                        emptyText={range === "delayed" ? "Nothing overdue" : range === "today" ? "No tasks due today" : "No tasks due in the next 7 days"}
                    />
                </section>

                <section className="surface flex flex-col gap-4 p-5">
                    <h2 className="text-base font-semibold">
                        Waiting for your review{reviews.data?.length ? ` (${reviews.data.length})` : ""}
                    </h2>
                    {reviews.isLoading ? (
                        <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : !reviews.data?.length ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Nothing to review</p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {reviews.data.map((t) => (
                                <li key={t.id} className="rounded-2xl bg-card px-4 py-3 shadow-xs">
                                    <p className="truncate text-sm font-medium">{t.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {[t.project?.name, t.assignee?.surname ?? t.assignee?.name].filter(Boolean).join(" · ")}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </>
    );
}
