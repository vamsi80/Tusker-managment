"use client";

import { Calendar, User } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";

interface Task {
  id: string;
  name: string;
  taskSlug: string;
  dueDate: Date | null;
  status: string | null;
  assignee: {
    workspaceMember: {
      user: {
        surname: string | null;
        image: string | null;
      };
    };
  } | null;
}

interface DueThisWeekWidgetProps {
  dueThisWeek: Task[];
  weekStart: Date;
  weekEnd: Date;
}

const statusColorMap: Record<string, string> = {
  TO_DO: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  REVIEW: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  HOLD: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export function DueThisWeekWidget({ dueThisWeek, weekStart, weekEnd }: DueThisWeekWidgetProps) {
  const formattedRange = `${format(new Date(weekStart), "MMM d")} - ${format(new Date(weekEnd), "MMM d")}`;
  const { openSubTaskSheet } = useSubTaskSheet();

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Due This Week
          </h3>
          <span className="text-xs text-muted-foreground">{formattedRange}</span>
        </div>
        <div className="p-1.5 rounded-xl bg-primary/10 text-primary">
          <Calendar className="size-4.5" />
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[300px] pr-1">
        {dueThisWeek.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground/60">
            <p className="text-sm italic">No tasks due this week</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dueThisWeek.map((task) => {
              const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
              const assigneeUser = task.assignee?.workspaceMember?.user;
              const displayName = assigneeUser ? (assigneeUser.surname || "User") : "";

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3 first:pt-0 last:pb-0 transition-colors"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => openSubTaskSheet(task)}
                      className="text-sm font-medium leading-relaxed truncate text-foreground hover:text-primary hover:underline text-left w-full transition-colors"
                    >
                      {task.name}
                    </button>
                    <div className="flex items-center gap-2 mt-1.5">
                      {task.status && (
                        <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5", statusColorMap[task.status] || "")}>
                          {task.status.replace("_", " ")}
                        </Badge>
                      )}
                      {task.dueDate && (
                        <span
                          className={cn(
                            "text-[11px] flex items-center gap-1",
                            isOverdue
                              ? "text-rose-500 font-medium"
                              : isToday(new Date(task.dueDate))
                                ? "text-amber-500 font-medium"
                                : "text-muted-foreground"
                          )}
                        >
                          {isOverdue
                            ? `Overdue (${format(new Date(task.dueDate), "EEE")})`
                            : isToday(new Date(task.dueDate))
                              ? "Due Today"
                              : format(new Date(task.dueDate), "EEE, MMM d")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {assigneeUser ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[10px] text-muted-foreground font-semibold">
                            {displayName.substring(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground font-medium truncate max-w-[100px]">
                          {displayName}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 italic">
                        <User className="size-3" />
                        <span>Unassigned</span>
                      </div>
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
