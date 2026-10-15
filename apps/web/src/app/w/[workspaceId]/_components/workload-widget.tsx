"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { workspacesClient } from "@tusker/api-client/workspaces";
import type { WorkspaceMemberRow } from "@tusker/core/types/workspace";
import { getUserDisplayName } from "@tusker/core/lib/user-display-name";
import { EmptyState } from "@/components/shared/empty-state";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Team Workload — open tasks (TO_DO / IN_PROGRESS / REVIEW) per member, busiest
 * first. Parity with the mobile Home screen's Workload tile; the full filterable
 * list lives on the Team page. Owners, admins and managers only.
 */
export function WorkloadWidget({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<WorkspaceMemberRow[] | null>(null);

  useEffect(() => {
    // ponytail: one 500-row page sorted client-side; add a server-side sort if workspaces outgrow it.
    workspacesClient
      .getMembers(workspaceId, 1, 500)
      .then((res) =>
        setMembers([...(res.workspaceMembers ?? [])].sort((a, b) => (b.openTaskCount ?? 0) - (a.openTaskCount ?? 0))),
      )
      .catch(() => setMembers([]));
  }, [workspaceId]);

  return (
    <div className="flex flex-col p-6 rounded-3xl border border-white/70 bg-card text-card-foreground shadow-lg backdrop-blur-xl h-full dark:border-border">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="flex items-center gap-2.5 text-base font-bold uppercase tracking-wide">
          <BarChart3 className="size-5" />
          Workload
        </h3>
        <Link href={`/w/${workspaceId}/team`} className="text-sm text-muted-foreground hover:text-foreground">
          View team
        </Link>
      </div>

      <div className="flex-1 overflow-auto max-h-[320px] pr-1">
        {members === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-full border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon={BarChart3} title="No members yet" description="Open tasks per member show here." />
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const count = m.openTaskCount ?? 0;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-full border border-border bg-muted/30 px-6 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{getUserDisplayName(m as any)}</p>
                    {(m.designation || m.departmentName) && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {[m.designation, m.departmentName].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      badgeVariants({ variant: count === 0 ? "muted" : count < 5 ? "success" : count < 10 ? "warning" : "danger" }),
                      "shrink-0",
                    )}
                  >
                    {count} {count === 1 ? "task" : "tasks"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
