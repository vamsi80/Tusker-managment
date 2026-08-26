"use client";

import Link from "next/link";
import { ClipboardList, CheckCircle2, Clock, UserMinus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";
import { cn } from "@/lib/utils";

interface AbsentMember {
  id: string;
  projectRole: string;
  workspaceMember?: { user?: { surname: string | null } | null } | null;
}

interface TaskSummaryWidgetProps {
  totalCount: number;
  todoCount: number;
  completedCount: number;
  absentMembers: AbsentMember[];
  listHref: string;
  showAbsent?: boolean;
}

export function TaskSummaryWidget({
  totalCount,
  todoCount,
  completedCount,
  absentMembers,
  listHref,
  showAbsent = true,
}: TaskSummaryWidgetProps) {
  const router = useSafeNavigation();

  const stats = [
    {
      label: "Total Tasks",
      value: totalCount,
      icon: ClipboardList,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      href: listHref,
    },
    {
      label: "Pending",
      value: todoCount,
      icon: Clock,
      color: "text-slate-500",
      bgColor: "bg-slate-500/10",
      borderColor: "border-slate-500/20",
      href: `${listHref}?status=TO_DO,IN_PROGRESS,REVIEW`,
    },
    {
      label: "Completed",
      value: completedCount,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
      href: `${listHref}?status=COMPLETED`,
    },
  ];

  const colClass = showAbsent
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
    : "grid grid-cols-1 sm:grid-cols-3 gap-4";

  const card = (stat: (typeof stats)[number] | { label: string; value: number; icon: typeof UserMinus; color: string; bgColor: string; borderColor: string }) => {
    const Icon = stat.icon;
    return (
      <div
        className={cn(
          "flex flex-col p-5 rounded-2xl border bg-card text-card-foreground shadow-sm text-left w-full transition-colors hover:bg-accent/50",
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
  };

  return (
    <div className={colClass}>
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          prefetch={false}
          scroll={false}
          onClick={(e) => {
            e.preventDefault();
            router.push(stat.href);
          }}
          className={cn("rounded-2xl", router.isNavigating && "pointer-events-none opacity-50")}
        >
          {card(stat)}
        </Link>
      ))}

      {showAbsent && (
        <Popover>
          <PopoverTrigger className="rounded-2xl text-left">
            {card({
              label: "Absent Today",
              value: absentMembers.length,
              icon: UserMinus,
              color: "text-rose-500",
              bgColor: "bg-rose-500/10",
              borderColor: "border-rose-500/20",
            })}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Absent Today
            </p>
            {absentMembers.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">All members are present today</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {absentMembers.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {member.workspaceMember?.user?.surname || "Member"}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize shrink-0">
                      {member.projectRole.toLowerCase().replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
