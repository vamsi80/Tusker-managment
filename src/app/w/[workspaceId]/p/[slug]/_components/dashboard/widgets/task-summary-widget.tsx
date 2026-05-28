"use client";

import { ClipboardList, CheckCircle2, Clock, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskSummaryWidgetProps {
  totalCount: number;
  todoCount: number;
  completedCount: number;
  absentCount: number;
  showAbsent?: boolean;
}

export function TaskSummaryWidget({
  totalCount,
  todoCount,
  completedCount,
  absentCount,
  showAbsent = true,
}: TaskSummaryWidgetProps) {
  const stats = [
    {
      label: "Total Tasks",
      value: totalCount,
      icon: ClipboardList,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
    {
      label: "Pending",
      value: todoCount,
      icon: Clock,
      color: "text-slate-500",
      bgColor: "bg-slate-500/10",
      borderColor: "border-slate-500/20",
    },
    {
      label: "Completed",
      value: completedCount,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
    ...(showAbsent
      ? [{
          label: "Absent Today",
          value: absentCount,
          icon: UserMinus,
          color: "text-rose-500",
          bgColor: "bg-rose-500/10",
          borderColor: "border-rose-500/20",
        }]
      : []),
  ];

  const colClass = showAbsent
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
    : "grid grid-cols-1 sm:grid-cols-3 gap-4";

  return (
    <div className={colClass}>
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div
            key={idx}
            className={cn(
              "flex flex-col p-5 rounded-2xl border bg-card text-card-foreground shadow-sm",
              stat.borderColor
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {stat.label}
              </span>
              <div className={cn("p-2 rounded-xl", stat.bgColor)}>
                <Icon className={cn("size-4", stat.color)} />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
          </div>
        );
      })}
    </div>
  );
}
