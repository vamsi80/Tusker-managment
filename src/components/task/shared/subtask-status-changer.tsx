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
    coordinatorProjectIds?: string[];
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
    coordinatorProjectIds: propCoordinatorProjectIds,
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
    const coordinatorProjectIds = context?.coordinatorProjectIds || propCoordinatorProjectIds;

    const [isPending, startTransition] = useTransition();
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null);

    if (!subTask.status) {
        return <span className="text-muted-foreground text-xs text-center block">-</span>;
    }

    const currentUserId = permissions?.userId || userId;
    const currentProjectMemberId = permissions?.projectMember?.id;
    const isPM = permissions?.isProjectManager || isWorkspaceAdmin;
    const isCoordinator = permissions?.isProjectCoordinator || coordinatorProjectIds?.includes(projectId || "");
    const isLead = permissions?.isProjectLead || leadProjectIds?.includes(projectId || "");
    const subTaskCreatorUserId = subTask.createdBy?.id;
    const subTaskCreatorMemberId = (subTask as any).createdById;
    const subTaskAssigneeUserId = subTask.assignee?.id;
    const subTaskAssigneeMemberId = (subTask as any).assigneeId;

    const isCreator = !!(
        (currentUserId && subTaskCreatorUserId && currentUserId === subTaskCreatorUserId) ||
        (currentProjectMemberId && subTaskCreatorMemberId && currentProjectMemberId === subTaskCreatorMemberId)
    );

    const isAssignee = !!(
        (currentUserId && subTaskAssigneeUserId && currentUserId === subTaskAssigneeUserId) ||
        (currentProjectMemberId && subTaskAssigneeMemberId && currentProjectMemberId === subTaskAssigneeMemberId)
    );

    // A user can change status if they are Admin/PM/Coordinator, or if they are Lead & creator/assignee, or if they are Member & creator/assignee
    const canEditThisSubTask = isPM || isCoordinator || isCreator || isAssignee;

    const isActingAsManager = !isAssignee && (isPM || isCoordinator);

    const isTransitionAllowed = (targetStatus: TaskStatus): { allowed: boolean; reason?: string } => {
        if (!canEditThisSubTask) {
            return { allowed: false, reason: "You do not have permission to update this task." };
        }

        // If the user is the assignee of this subtask, they are ALWAYS treated as a worker/member for this subtask
        // and can only change the status till REVIEW (cannot mark COMPLETED, HOLD, CANCELLED, cannot move out of REVIEW),
        // even if they are a Project Manager or Coordinator.
        if (isAssignee) {
            if (targetStatus === "COMPLETED") {
                return { allowed: false, reason: "As the assignee, you cannot mark this task as Completed." };
            }
            if (targetStatus === "HOLD") {
                return { allowed: false, reason: "As the assignee, you cannot put this task on Hold." };
            }
            if (targetStatus === "CANCELLED") {
                return { allowed: false, reason: "As the assignee, you cannot cancel this task." };
            }
            if (subTask.status === "REVIEW") {
                return { allowed: false, reason: "As the assignee, you cannot move this task out of Review status." };
            }
        }

        // 🔒 COMPLETED rule:
        // - Project Manager / Coordinator (not assigned as worker): always allowed.
        // - Project Lead: allowed ONLY on subtasks they personally created (and not assigned as worker).
        // - Member / others: never allowed.
        const leadCanComplete = !isAssignee && isLead && isCreator;
        if (targetStatus === "COMPLETED" && !isActingAsManager && !leadCanComplete) {
            return { allowed: false, reason: "Only the Project Manager / Coordinator (not assigned as worker) or the Lead who created this task can mark tasks as Completed." };
        }

        // Specific Restriction: Tasks in REVIEW status
        // - Only PM / Coordinator (not assigned as worker) or creating Lead (not assigned as worker) can move task out of REVIEW.
        if (subTask.status === "REVIEW") {
            if (!isActingAsManager && !leadCanComplete) {
                return { allowed: false, reason: "Only the Project Manager / Coordinator (not assigned as worker) or the creating Lead can move this task out of Review status." };
            }
        }

        // Constraint: COMPLETED status can only be reached from REVIEW
        if (targetStatus === "COMPLETED" && subTask.status !== "REVIEW") {
            return { allowed: false, reason: "Before marking a task as Completed, you must first move it to Review status." };
        }

        return { allowed: true };
    };

    const isCommentRequired = (targetStatus: TaskStatus) => {
        const currentStatus = subTask.status;
        const isMandatory =
            ["HOLD", "CANCELLED", "REVIEW"].includes(targetStatus) ||
            (currentStatus && ["HOLD", "CANCELLED", "COMPLETED"].includes(currentStatus)) ||
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
