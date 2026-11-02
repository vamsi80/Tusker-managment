import { useDeferredValue, useState } from "react";
import { Search } from "lucide-react";
import { STATUS_LABELS } from "@tusker/core/lib/colors/status-colors";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { TaskList } from "~/components/TaskList";

const FILTERS = [
    { key: "active", label: "Active", status: ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD"] },
    ...(["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED"] as const).map((s) => ({ key: s, label: STATUS_LABELS[s], status: [s] })),
];

/** Every task the person can see in this workspace, filtered like the website's list view. */
export function TasksScreen() {
    const [filter, setFilter] = useState(FILTERS[0].key);
    const [search, setSearch] = useState("");
    const q = useDeferredValue(search.trim());
    const status = FILTERS.find((f) => f.key === filter)!.status;

    return (
        <>
            <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Tasks</h1>
                <p className="mt-1 text-sm text-foreground/80">Change a status here and it updates everywhere.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-full pl-9" />
                </div>
                <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1 text-xs">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setFilter(f.key)}
                            className={cn(
                                "rounded-full px-3 py-1 font-semibold",
                                filter === f.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <TaskList
                params={{ status, search: q || undefined, hierarchyMode: "all", sorts: [{ field: "dueDate", direction: "asc" }] }}
                emptyText={q ? `No tasks match "${q}".` : "No tasks here."}
            />
        </>
    );
}
