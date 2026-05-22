"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTaskTableContext } from "../list/task-table/context/task-table-context";
import { getStatusColors, getStatusLabel } from "@/lib/colors/status-colors";
import { ActivityDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/activity-form";
import { cn } from "@/lib/utils";
import type { SubTaskType } from "@/types/task";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "HOLD" | "COMPLETED" | "CANCELLED";

const STATUSES: TaskStatus[] = ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "CANCELLED"];

interface SubtaskStatusChangerProps {
    subTask: SubTaskType;
    onSubTaskUpdated: (subTaskId: string, updatedData: Partial<SubTaskType>) => void;
    workspaceId?: string;
    projectId?: string;
    permissions?: UserPermissionsType;
    userId?: string;
    isWorkspaceAdmin?: boolean;
    leadProjectIds?: string[];
}

export function SubtaskStatusChanger({
    subTask,
    onSubTaskUpdated,
    workspaceId: propWorkspaceId,
    projectId: propProjectId,
    permissions: propPermissions,
    userId: propUserId,
    isWorkspaceAdmin: propIsWorkspaceAdmin,
    leadProjectIds: propLeadProjectIds,
}: SubtaskStatusChangerProps) {
    // Attempt to consume from context, fallback to props
    let context: any = null;
    try {
        context = useTaskTableContext();
    } catch (e) {
        // Context not available
    }

    const workspaceId = context?.workspaceId || propWorkspaceId;
    const projectId = context?.projectId || propProjectId;
    const permissions = context?.permissions || propPermissions;
    const userId = context?.userId || propUserId;
    const isWorkspaceAdmin = context?.isWorkspaceAdmin || propIsWorkspaceAdmin;
    const leadProjectIds = context?.leadProjectIds || propLeadProjectIds;

    const [isPending, startTransition] = useTransition();
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null);

    if (!subTask.status) {
        return <span className="text-muted-foreground text-xs text-center block">-</span>;
    }

    const currentProjectMemberId = permissions?.projectMember?.id;
    const isPM = permissions?.isProjectManager || isWorkspaceAdmin;
    const isLead = permissions?.isProjectLead || leadProjectIds?.includes(projectId || "");
    const subTaskCreatorId = subTask.createdBy?.id || (subTask as any).createdById;
    const subTaskAssigneeId = subTask.assignee?.id || (subTask as any).assigneeId;

    const isCreator = currentProjectMemberId ? subTaskCreatorId === currentProjectMemberId : false;
    const isAssignee = currentProjectMemberId ? subTaskAssigneeId === currentProjectMemberId : false;

    // A user can change status if they are Admin/PM, or if they are Lead & creator/assignee, or if they are Member & creator/assignee
    const canEditThisSubTask = isPM || (isLead && isCreator) || (isCreator || isAssignee);

    const isTransitionAllowed = (targetStatus: TaskStatus): { allowed: boolean; reason?: string } => {
        if (!canEditThisSubTask) {
            return { allowed: false, reason: "You do not have permission to update this task." };
        }

        // 🔒 COMPLETED rule:
        // - Project Manager: always allowed.
        // - Project Lead: allowed ONLY on subtasks they personally created.
        // - Member / others: never allowed.
        const leadCanComplete = isLead && isCreator;
        if (targetStatus === "COMPLETED" && !isPM && !leadCanComplete) {
            return { allowed: false, reason: "Only the Project Manager (or the Lead who created this task) can mark tasks as Completed." };
        }

        // Specific Restriction: Tasks in REVIEW status
        // - Only PM/Lead-creator can move task out of REVIEW.
        if (subTask.status === "REVIEW") {
            if (isAssignee && !isPM && !leadCanComplete) {
                return { allowed: false, reason: "As the assignee, you cannot move this task out of Review status." };
            }
        }

        // Constraint: IN_PROGRESS -> COMPLETED is forbidden (must go via REVIEW)
        if (subTask.status === "IN_PROGRESS" && targetStatus === "COMPLETED") {
            return { allowed: false, reason: "Tasks in In-Progress must be moved to Review before marking as Completed." };
        }

        return { allowed: true };
    };

    const isCommentRequired = (targetStatus: TaskStatus) => {
        const currentStatus = subTask.status;
        const isMandatory =
            ["HOLD", "CANCELLED", "REVIEW"].includes(targetStatus) ||
            (currentStatus && ["HOLD", "CANCELLED"].includes(currentStatus)) ||
            (currentStatus === "REVIEW" && (targetStatus === "TO_DO" || targetStatus === "IN_PROGRESS")) ||
            (currentStatus === "IN_PROGRESS" && targetStatus === "TO_DO");

        return !!isMandatory;
    };

    const updateStatus = async (targetStatus: TaskStatus, comment?: string, attachmentData?: string) => {
        if (!workspaceId || !projectId) {
            toast.error("Missing workspace or project context");
            return;
        }

        startTransition(async () => {
            try {
                const res = await fetch(`/api/v1/tasks/${subTask.id}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        newStatus: targetStatus,
                        workspaceId,
                        projectId,
                        comment,
                        attachmentData,
                    }),
                });

                const json = await res.json();
                if (!res.ok) {
                    toast.error(json.message || "Failed to update subtask status");
                    return;
                }

                if (json.success) {
                    onSubTaskUpdated(subTask.id, { status: targetStatus });
                    toast.success(`Status updated to ${getStatusLabel(targetStatus)}`);
                }
            } catch (err) {
                console.error(err);
                toast.error("An error occurred while updating status");
            }
        });
    };

    const handleSelectStatus = (targetStatus: TaskStatus) => {
        if (targetStatus === subTask.status) return;

        const check = isTransitionAllowed(targetStatus);
        if (!check.allowed) {
            toast.error(check.reason || "This transition is not allowed");
            return;
        }

        if (isCommentRequired(targetStatus)) {
            setPendingStatus(targetStatus);
            setIsActivityOpen(true);
        } else {
            updateStatus(targetStatus);
        }
    };

    const handleActivitySubmit = async (comment: string, attachmentLink?: string) => {
        if (!pendingStatus) return;
        await updateStatus(pendingStatus, comment, attachmentLink);
        setIsActivityOpen(false);
        setPendingStatus(null);
    };

    const currentColors = getStatusColors(subTask.status);

    // If the user has absolutely no edit rights, render a static badge
    if (!canEditThisSubTask) {
        return (
            <Badge
                variant="outline"
                className={cn(
                    "text-[10px] sm:text-xs font-medium h-5 px-1.5 flex items-center justify-center whitespace-nowrap cursor-default",
                    currentColors.color,
                    currentColors.bgColor,
                    currentColors.borderColor
                )}
            >
                {getStatusLabel(subTask.status)}
            </Badge>
        );
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        disabled={isPending}
                        className={cn(
                            "text-[10px] sm:text-xs font-medium h-5 px-1.5 rounded-md border flex items-center justify-center whitespace-nowrap transition-all focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-0 disabled:opacity-50",
                            currentColors.color,
                            currentColors.bgColor,
                            currentColors.borderColor,
                            "hover:opacity-80 active:scale-95 cursor-pointer"
                        )}
                    >
                        {isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            getStatusLabel(subTask.status)
                        )}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[120px]">
                    {STATUSES.map((status) => {
                        const colors = getStatusColors(status);
                        const { allowed } = isTransitionAllowed(status);
                        const isCurrent = status === subTask.status;

                        return (
                            <DropdownMenuItem
                                key={status}
                                disabled={!allowed || isCurrent}
                                onSelect={() => handleSelectStatus(status)}
                                className={cn(
                                    "text-xs px-2 py-1 my-0.5 cursor-pointer rounded-sm flex items-center justify-between",
                                    (!allowed || isCurrent) && "opacity-40 cursor-not-allowed",
                                    isCurrent && "font-semibold bg-accent"
                                )}
                            >
                                <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-medium", colors.color, colors.bgColor, colors.borderColor)}>
                                    {getStatusLabel(status)}
                                </span>
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>

            {isActivityOpen && (
                <ActivityDialog
                    isOpen={isActivityOpen}
                    onClose={() => {
                        setIsActivityOpen(false);
                        setPendingStatus(null);
                    }}
                    onSubmit={handleActivitySubmit}
                    subTaskName={subTask.name}
                />
            )}
        </>
    );
}
