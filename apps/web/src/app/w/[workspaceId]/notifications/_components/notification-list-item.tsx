"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn, toTitleCase } from "@/lib/utils";

interface NotifItem {
  id?: string;
  taskId?: string;
  taskName?: string;
  projectName?: string;
  parentTaskName?: string;
  count?: number;
  latestComment?: { user?: { surname?: string | null; image?: string | null }; content?: string; createdAt?: string } | null;
  [key: string]: unknown;
}

interface NotificationListItemProps {
  notif: NotifItem;
  isRead?: boolean;
  isActive?: boolean;
  onClick: () => void;
}

export function NotificationListItem({ notif, isRead, isActive, onClick }: NotificationListItemProps) {
  const latestComment = notif.latestComment || {};
  const commenterUser = latestComment.user || {};
  const commenterName = commenterUser.surname || "Someone";
  const commentText = latestComment.content || "";
  const createdAt = latestComment.createdAt ? new Date(latestComment.createdAt) : new Date();

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex gap-3 p-3.5 border-b last:border-0 relative overflow-hidden transition-all text-left w-full active:scale-[0.99]",
        isActive
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/10"
          : "hover:bg-muted/50"
      )}
    >
      {/* Unread indicator line on the left */}
      {!isRead && !isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      )}

      <Avatar className="size-9 shrink-0">
        <AvatarImage src={commenterUser.image ?? undefined} />
        <AvatarFallback className={cn(
          "font-medium text-xs transition-colors",
          isActive ? "bg-primary-foreground/20 text-white" : "bg-primary/10 text-primary"
        )}>
          {commenterName[0]}
        </AvatarFallback>
      </Avatar>

      <div className="space-y-1 min-w-0 flex-1">
        {/* Breadcrumb row */}
        <div className={cn(
          "flex items-center gap-1 text-[9px] uppercase tracking-wider truncate",
          isActive ? "text-primary-foreground/75" : "text-muted-foreground/60"
        )}>
          <span className="truncate max-w-[80px]">{toTitleCase(notif.projectName)}</span>
          <span>/</span>
          {notif.parentTaskName && (
            <>
              <span className="truncate max-w-[65px]">{toTitleCase(notif.parentTaskName)}</span>
              <span>/</span>
            </>
          )}
          <span className={cn(
            "truncate max-w-[120px] font-semibold",
            isActive ? "text-primary-foreground" : "text-foreground"
          )}>
            {toTitleCase(notif.taskName)}
          </span>
        </div>

        {/* Commenter info */}
        <p className="text-[13px] leading-none font-semibold">
          {commenterName}
          {(notif.count ?? 0) > 1 && (
            <span className={cn(
              "ml-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold align-middle",
              isActive ? "bg-primary-foreground/25 text-white" : "bg-primary/10 text-primary"
            )}>
              +{(notif.count ?? 0) - 1} more
            </span>
          )}
        </p>

        {notif.parentTaskName && (
          <p className={cn(
            "text-[10px] font-medium line-clamp-1 truncate leading-tight",
            isActive ? "text-primary-foreground/80" : "text-muted-foreground/80"
          )}>
            Parent Task: <span className="font-semibold">{toTitleCase(notif.parentTaskName)}</span>
          </p>
        )}

        {/* Snippet preview */}
        <p className={cn(
          "text-xs line-clamp-1",
          (notif.type === "comment" || notif.type === "activity" || notif.type === "DM_MESSAGE") && "italic",
          isActive ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          {notif.type === "comment" || notif.type === "activity" || notif.type === "DM_MESSAGE" ? `"${commentText}"` : commentText}
        </p>

        {/* Timestamp */}
        <p className={cn(
          "text-[9px]",
          isActive ? "text-primary-foreground/70" : "text-muted-foreground/50"
        )}>
          {formatDistanceToNow(createdAt, { addSuffix: true })}
        </p>
      </div>
    </button>
  );
}
