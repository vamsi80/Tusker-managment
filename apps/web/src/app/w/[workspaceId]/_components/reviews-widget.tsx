"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { EmptyState } from "@/components/shared/empty-state";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { getUserDisplayName } from "@tusker/core/lib/user-display-name";

interface ReviewItem {
  id: string;
  name: string;
  taskSlug: string;
  updatedAt: string;
  parentTask: { name: string } | null;
  project: { name: string } | null;
  assignee: { workspaceMember: { user: { name: string; surname?: string | null } } | null } | null;
}

/**
 * "My Reviews" — tasks in REVIEW where the current user is the named reviewer.
 * Parity with the mobile Home screen's ReviewsWidget.
 */
export function ReviewsWidget({ workspaceId }: { workspaceId: string }) {
  const { openSubTaskSheet } = useSubTaskSheet();
  const [reviews, setReviews] = useState<ReviewItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tasks/pending-reviews?w=${workspaceId}`);
      const json = await res.json();
      setReviews(json?.success ? json.data ?? [] : []);
    } catch {
      setReviews((prev) => prev ?? []);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  // A status or reviewer change anywhere can add or drop a review.
  useEffect(() => {
    return pubsub.subscribe(EVENTS.TEAM_UPDATE, (data: any) => {
      const action = typeof data?.action === "string" ? data.action : "";
      const type = typeof data?.type === "string" ? data.type : "";
      if (action.includes("TASK") || type.includes("TASK")) load();
    });
  }, [load]);

  return (
    <div className="flex flex-col p-6 glass glass-card rounded-3xl text-card-foreground h-full">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="flex items-center gap-2.5 text-base font-bold uppercase tracking-wide">
          <CheckCheck className="size-5" />
          My Reviews
        </h3>
        <span className="text-sm text-muted-foreground text-right">
          {reviews?.length ? `${reviews.length} awaiting` : "Awaiting review"}
        </span>
      </div>

      <div className="flex-1 overflow-auto max-h-[320px] pr-1">
        {reviews === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-full border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState icon={CheckCheck} title="Nothing awaiting your review" description="You're all caught up!" />
        ) : (
          <div className="space-y-2">
            {reviews.map((item) => {
              const assignee = item.assignee?.workspaceMember?.user;
              const meta = [item.project?.name, item.parentTask ? `Subtask of "${item.parentTask.name}"` : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={item.id} className="rounded-full border border-border bg-muted/30 px-6 py-3">
                  <button
                    type="button"
                    onClick={() => openSubTaskSheet(item)}
                    className="text-sm font-medium truncate block text-left w-full text-foreground hover:text-primary-ink hover:underline transition-colors"
                  >
                    {item.name}
                  </button>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {meta ? `${meta} · ` : ""}by {getUserDisplayName(assignee as any, "someone")}
                    </span>
                    <span className="ml-auto shrink-0">
                      {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                    </span>
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
