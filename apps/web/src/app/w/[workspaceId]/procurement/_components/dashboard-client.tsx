"use client";

import { useCallback, useEffect, useState } from "react";
import { endOfWeek, format, isBefore, isWithinInterval, startOfDay, startOfWeek } from "date-fns";
import {
  FileText,
  AlertCircle,
  Send,
  Check,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock,
} from "lucide-react";
import Link from "next/link";
import {
  ACTIVE_RFQ_STATUSES,
  AWAITING_APPROVAL_STATUSES,
  CLOSED_PROCUREMENT_STATUSES,
  INDENT_STATUS_OPTIONS,
} from "@tusker/core/lib/procurement/status-filters";

interface DashboardClientProps {
  workspaceId: string;
}

interface DashboardIndent {
  id: string;
  indentId?: string | null;
  name: string;
  status: string;
  expectedDelivery?: string | null;
  project?: {
    name?: string | null;
  } | null;
}

const TERMINAL_INDENT_STATUSES = new Set(["APPROVED", "REJECTED", "CANCELLED"]);
const INDENT_STATUS_LABELS = new Map(
  INDENT_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

export function DashboardClient({ workspaceId }: DashboardClientProps) {
  const [stats, setStats] = useState({
    totalIndents: 0,
    pendingApprovals: 0,
    activeRfqs: 0,
    completedProcurements: 0,
  });
  const [indents, setIndents] = useState<DashboardIndent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const [indentsRes, itemsRes] = await Promise.all([
        fetch(`/api/v1/procurement/indents?w=${workspaceId}`),
        fetch(`/api/v1/procurement/indents/line-items?w=${workspaceId}&projectId=ALL&status=ALL`),
      ]);
      const indentsData = await indentsRes.json();
      const itemsData = await itemsRes.json();

      if (indentsData.success) {
        setIndents(indentsData.data);
      }

      if (indentsData.success && itemsData.success) {
        const indentsList: DashboardIndent[] = indentsData.data;
        const itemsList = itemsData.data;

        setStats({
          totalIndents: indentsList.length,
          pendingApprovals: indentsList.filter((i: any) => AWAITING_APPROVAL_STATUSES.includes(i.status)).length,
          activeRfqs: itemsList.filter((item: any) => ACTIVE_RFQ_STATUSES.includes(item.status)).length,
          completedProcurements: itemsList.filter((item: any) => CLOSED_PROCUREMENT_STATUSES.includes(item.status)).length,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
        <Clock className="size-5 animate-spin mr-1.5 text-primary" /> Loading dashboard overview...
      </div>
    );
  }

  const cards = [
    {
      label: "Total Indent Requests",
      value: stats.totalIndents,
      href: `/w/${workspaceId}/procurement/indents?status=ALL`,
      valueClassName: "text-foreground",
      labelClassName: "text-muted-foreground",
      iconClassName: "text-primary",
      icon: FileText,
      helper: "Workspace volume",
    },
    {
      label: "Awaiting Approvals",
      value: stats.pendingApprovals,
      href: `/w/${workspaceId}/procurement/indents?status=${AWAITING_APPROVAL_STATUSES.join(",")}`,
      valueClassName: "text-amber-600",
      labelClassName: "text-amber-700",
      iconClassName: "text-amber-500",
      icon: AlertCircle,
      helper: "Action required",
    },
    {
      label: "Active RFQ Sessions",
      value: stats.activeRfqs,
      href: `/w/${workspaceId}/procurement/rfqs?status=${ACTIVE_RFQ_STATUSES.join(",")}`,
      valueClassName: "text-blue-600",
      labelClassName: "text-blue-700",
      iconClassName: "text-blue-500",
      icon: Send,
      helper: "Out to vendors",
    },
    {
      label: "Closed Procurements",
      value: stats.completedProcurements,
      href: `/w/${workspaceId}/procurement/materials?status=${CLOSED_PROCUREMENT_STATUSES.join(",")}`,
      valueClassName: "text-emerald-600",
      labelClassName: "text-emerald-700",
      iconClassName: "text-emerald-500",
      icon: Check,
      helper: "Purchase finalized",
    },
  ];

  const today = startOfDay(new Date());
  const thisWeek = {
    start: startOfWeek(today, { weekStartsOn: 1 }),
    end: endOfWeek(today, { weekStartsOn: 1 }),
  };
  const activeIndents = indents.filter((indent) => !TERMINAL_INDENT_STATUSES.has(indent.status));
  const dueThisWeek = activeIndents
    .filter((indent) => {
      if (!indent.expectedDelivery) return false;
      const dueDate = new Date(indent.expectedDelivery);
      return !isBefore(dueDate, today) && isWithinInterval(dueDate, thisWeek);
    })
    .sort((first, second) =>
      new Date(first.expectedDelivery!).getTime() - new Date(second.expectedDelivery!).getTime(),
    );
  const overdueIndents = activeIndents
    .filter((indent) =>
      Boolean(indent.expectedDelivery && isBefore(new Date(indent.expectedDelivery), today)),
    )
    .sort((first, second) =>
      new Date(first.expectedDelivery!).getTime() - new Date(second.expectedDelivery!).getTime(),
    );

  const renderIndentList = (items: DashboardIndent[], emptyMessage: string) => {
    if (items.length === 0) {
      return (
        <div className="flex h-full min-h-32 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }

    return items.map((indent) => (
      <Link
        key={indent.id}
        href={`/w/${workspaceId}/procurement/indents/${indent.id}`}
        className="group flex items-center gap-3 border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[10px] font-bold text-primary">
              {indent.indentId || "Draft"}
            </span>
            <span className="truncate text-xs font-semibold text-foreground">{indent.name}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
            <span className="truncate">{indent.project?.name || "No project"}</span>
            <span aria-hidden="true">&bull;</span>
            <span className="shrink-0">{INDENT_STATUS_LABELS.get(indent.status) || indent.status}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          {indent.expectedDelivery && format(new Date(indent.expectedDelivery), "MMM d")}
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    ));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 xl:overflow-hidden">
      {/* Stats row */}
      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              key={card.label}
              href={card.href}
              aria-label={`View ${card.label.toLowerCase()}`}
              className="group flex min-h-32 flex-col justify-between rounded-lg border border-border/80 bg-card p-4 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0"
            >
              <div>
                <span className={`text-[10px] font-bold uppercase ${card.labelClassName}`}>
                  {card.label}
                </span>
                <h3 className={`mt-1 text-2xl font-bold ${card.valueClassName}`}>{card.value}</h3>
              </div>
              <div className="mt-2 flex items-center gap-1 border-t pt-2 text-[10px] text-muted-foreground">
                <Icon className={`size-3 ${card.iconClassName}`} />
                <span>{card.helper}</span>
                <ArrowRight className="ml-auto size-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid min-h-0 shrink-0 grid-cols-1 gap-4 xl:flex-1 xl:grid-cols-2">
        <section className="flex h-72 min-h-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm xl:h-auto">
          <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Due This Week</h2>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {dueThisWeek.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {renderIndentList(dueThisWeek, "No active indents are due this week.")}
          </div>
        </section>

        <section className="flex h-72 min-h-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm xl:h-auto">
          <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-red-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Overdue</h2>
            </div>
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">
              {overdueIndents.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {renderIndentList(overdueIndents, "There are no overdue active indents.")}
          </div>
        </section>
      </div>
    </div>
  );
}
