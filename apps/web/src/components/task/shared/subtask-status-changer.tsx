"use client";

import { useState, useTransition, useContext } from "react";
import { toast } from "@/lib/toast";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskTableContext } from "../list/task-table/context/task-table-context-object";
import { getStatusColors, getStatusLabel } from "@tusker/core/lib/colors/status-colors";
import { ActivityDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/activity-form";
import { cn } from "@/lib/utils";
import type { SubTaskType } from "@tusker/core/types/task";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";
import type { ActivityAttachment } from "@tusker/core/lib/attachments";
import {
    resolveProjectPermissions,
    canProject,
    canSetStatus,
    isMandatoryTransition,
    DEFAULT_PROJECT_SETTINGS,
} from "@tusker/core/lib/constants/project-permissions";

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
    // Consume from context unconditionally, fallback to props
    const context = useContext(TaskTableContext);

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
    /**
     * Shown immediately on click instead of waiting for the round-trip, and
     * rolled back if the server refuses. Keyed by task id because list rows are
     * reused - without the key a recycled row would wear another task's status.
     */
    const [optimistic, setOptimistic] = useState<{ id: string; status: TaskStatus } | null>(null);

    if (!subTask.status) {
        return <span className="text-muted-foreground text-xs text-center block">-</span>;
    }

    const displayStatus = (
        optimistic?.id === subTask.id ? optimistic.status : subTask.status
    ) as TaskStatus;

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

    /**
     * The same matrix the API gates on. The workspace-wide task list renders this
     * component without project-scoped permissions in hand, so fall back to the
     * role defaults there — which is exactly the behaviour it had before.
     */
    const projectPermissions =
        (permissions as { projectPermissions?: ReturnType<typeof resolveProjectPermissions> })
            ?.projectPermissions ??
        resolveProjectPermissions(
            isPM ? "PROJECT_MANAGER" : isCoordinator ? "PROJECT_COORDINATOR" : isLead ? "LEAD" : "MEMBER",
            undefined,
            null,
            isWorkspaceAdmin,
        );

    // Ownership scoping is orthogonal to the matrix: only Admin / PM / Coordinator
    // act on tasks that are neither theirs nor assigned to them.
    const hasProjectWideStanding = !!(isWorkspaceAdmin || isPM || isCoordinator);
    const canEditThisSubTask =
        canProject(projectPermissions, "task:status") &&
        (hasProjectWideStanding || isCreator || isAssignee);

    const canApprove = (target: TaskStatus) =>
        canSetStatus(projectPermissions, target, isAssignee) &&
        (hasProjectWideStanding || isCreator);

    const isTransitionAllowed = (targetStatus: TaskStatus): { allowed: boolean; reason?: string } => {
        if (!canEditThisSubTask) {
            return { allowed: false, reason: "You do not have permission to update this task." };
        }

        // The assignee is always the worker on their own task, never its approver,
        // no matter what the matrix says.
        if (isAssignee && ["COMPLETED", "HOLD", "CANCELLED"].includes(targetStatus)) {
            return { allowed: false, reason: `As the assignee, you cannot set this task to ${getStatusLabel(targetStatus)}.` };
        }
        if (isAssignee && displayStatus === "REVIEW") {
            return { allowed: false, reason: "As the assignee, you cannot move this task out of Review status." };
        }

        if (["COMPLETED", "HOLD", "CANCELLED"].includes(targetStatus) && !canApprove(targetStatus)) {
            return { allowed: false, reason: `You don't have permission to set this task to ${getStatusLabel(targetStatus)}.` };
        }

        // Moving out of REVIEW is an approval decision, same standing as Completed.
        if (displayStatus === "REVIEW" && !canApprove("COMPLETED")) {
            return { allowed: false, reason: "You cannot move this task out of Review status." };
        }

        // Constraint: COMPLETED status can only be reached from REVIEW
        if (targetStatus === "COMPLETED" && displayStatus !== "REVIEW") {
            return { allowed: false, reason: "Before marking a task as Completed, you must first move it to Review status." };
        }

        return { allowed: true };
    };

    const projectSettings =
        (permissions as { projectSettings?: typeof DEFAULT_PROJECT_SETTINGS })?.projectSettings ??
        DEFAULT_PROJECT_SETTINGS;

    const isCommentRequired = (targetStatus: TaskStatus) =>
        isMandatoryTransition(displayStatus, targetStatus);

    const updateStatus = async (targetStatus: TaskStatus, comment?: string, attachmentData?: ActivityAttachment) => {
        if (!workspaceId || !projectId) {
            toast.error("Missing workspace or project context");
            return;
        }

        const previous = displayStatus;
        setOptimistic({ id: subTask.id, status: targetStatus });

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
                    setOptimistic({ id: subTask.id, status: previous });
                    toast.error(json.message || "Failed to update subtask status");
                    return;
                }

                if (json.success) {
                    onSubTaskUpdated(subTask.id, { status: targetStatus });
                    toast.success(`Status updated to ${getStatusLabel(targetStatus)}`);
                }
            } catch (err) {
                console.error(err);
                setOptimistic({ id: subTask.id, status: previous });
                toast.error("An error occurred while updating status");
            }
        });
    };

    const handleSelectStatus = (targetStatus: TaskStatus) => {
        if (targetStatus === displayStatus) return;

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

    const handleActivitySubmit = async (comment: string, attachment?: ActivityAttachment) => {
        if (!pendingStatus) return;
        await updateStatus(pendingStatus, comment, attachment);
        setIsActivityOpen(false);
        setPendingStatus(null);
    };

    const currentColors = getStatusColors(displayStatus);

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
                {getStatusLabel(displayStatus)}
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
                            <Loader2 className="size-3 animate-spin" />
                        ) : (
                            getStatusLabel(displayStatus)
                        )}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[120px]">
                    {STATUSES.map((status) => {
                        const colors = getStatusColors(status);
                        const { allowed } = isTransitionAllowed(status);
                        const isCurrent = status === displayStatus;

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
                    workspaceId={workspaceId}
                    projectId={projectId}
                    taskId={subTask.id}
                    requireAttachment={projectSettings.mandatoryAttachment}
                />
            )}
        </>
    );
}
