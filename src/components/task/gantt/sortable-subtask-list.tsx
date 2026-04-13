"use client";

import { CornerDownRight, User } from "lucide-react";
import { DraggableSubtaskBar } from "./draggable-subtask-bar";
import { cn } from "@/lib/utils";
import { GanttSubtask } from "./types";
import { getDaysBetween } from "./utils";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { InlineAssigneePicker } from "../shared/inline-assignee-picker";
import { ProjectMembersType } from "@/data/project/get-project-members";

interface SortableSubtaskRowProps {
    subtask: GanttSubtask;
    timelineStart: Date;
    totalDays: number;

    onSubtaskClick?: (subtaskId: string) => void;
    onSubTaskUpdate?: (subTaskId: string, data: Partial<any>) => void;
    workspaceId?: string;
    projectId?: string;
    members?: ProjectMembersType;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
    showDetails: boolean;
    allowedUserIds?: string[];
}

function SortableSubtaskRow({
    subtask,
    timelineStart,
    totalDays,

    showDetails,
    onSubtaskClick,
    onSubTaskUpdate,
    workspaceId,
    projectId,
    members,
    currentUser,
    permissions,
    allowedUserIds
}: SortableSubtaskRowProps) {

    // Helper to get status colors
    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'DONE':
            case 'COMPLETED':
                return "bg-green-100/50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
            case 'IN_PROGRESS':
            case 'STARTED':
                return "bg-blue-100/50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
            case 'BACKLOG':
                return "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700";
            default:
                return "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700";
        }
    };

    return (
        <div
            className="grid"
            style={{
                gridTemplateColumns: 'var(--gantt-sidebar-width) var(--gantt-total-width)',
            }}
        >
            {/* Left Panel - Multi-column Subtask Details */}
            <div
                className={cn(
                    "sticky left-0 z-30 flex items-center bg-white dark:bg-neutral-900 border-b border-r border-neutral-200 dark:border-neutral-700 h-full w-[var(--gantt-sidebar-width)] min-w-[var(--gantt-sidebar-width)] shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden",
                    !subtask.assignee && "bg-red-50/50 dark:bg-red-950/20"
                )}
            >
                {/* 1. Name Column */}
                <div className="w-[var(--col-name)] flex items-center gap-1 px-2 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full pl-8">
                    <CornerDownRight className="h-3 w-3 text-muted-foreground/30 shrink-0 mr-1" />
                    <span
                        className="text-[12px] text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground hover:underline transition-colors"
                        onClick={() => onSubtaskClick?.(subtask.id)}
                        title={subtask.name}
                    >
                        {subtask.name}
                    </span>
                </div>

                {showDetails && (
                    <>
                        {/* 2. Assignee Column */}
                        <div className="w-[var(--col-assignee)] flex items-center px-2 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full">
                            {members ? (
                                <InlineAssigneePicker
                                    subTask={subtask as any}
                                    members={members}
                                    projectId={projectId || ""}
                                    parentTaskId={subtask.parentTaskId || ""}
                                    canEdit={
                                        (permissions && currentUser) ? (
                                            (permissions.isWorkspaceAdmin ||
                                            permissions.managedProjectIds.includes(projectId || "") ||
                                            subtask.createdById === currentUser.id) && !subtask.assigneeId
                                        ) : false
                                    }
                                    onAssigned={(userId, member) => {
                                        onSubTaskUpdate?.(subtask.id, {
                                            assigneeId: member.projectMemberId,
                                            assignee: {
                                                id: member.userId,
                                                name: member.user.surname || member.user.name,
                                                image: member.user.image,
                                            }
                                        });
                                    }}
                                    allowedUserIds={allowedUserIds}
                                />
                            ) : (
                                <span className="text-[11px] text-muted-foreground">No members</span>
                            )}
                        </div>

                        {/* 3. Status Column */}
                        <div className="w-[var(--col-status)] flex items-center px-2 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full">
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-[9px] px-1 py-0 h-4 font-normal uppercase whitespace-nowrap",
                                    getStatusStyles(subtask.status || 'TO_DO')
                                )}
                            >
                                {subtask.status?.replace('_', ' ') || 'TO-DO'}
                            </Badge>
                        </div>

                        {/* 4. Days Column */}
                        <div className="w-[var(--col-days)] flex items-center px-2 shrink-0 border-r border-neutral-200 dark:border-neutral-700 h-full justify-center">
                            <span className="text-[10px] text-muted-foreground font-medium">
                                {subtask.start && subtask.end
                                    ? Math.max(1, Math.ceil((new Date(subtask.end).getTime() - new Date(subtask.start).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                                    : "-"
                                }
                            </span>
                        </div>

                        {/* 5. Dates Column */}
                        <div className="w-[var(--col-dates)] flex items-center px-2 shrink-0 h-full">
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {subtask.start && subtask.end
                                    ? `${format(new Date(subtask.start), "dd/MM/yyyy")}-${format(new Date(subtask.end), "dd/MM/yyyy")}`
                                    : "No dates"
                                }
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Right Panel - Subtask Bar */}
            <div
                className={cn(
                    "relative min-h-[32px] flex items-center w-full",
                    subtask.assignee ? "bg-neutral-50 dark:bg-neutral-800/30" : "bg-red-50 dark:bg-red-950/20 animate-[pulse_2s_infinite]",
                    "border-b border-neutral-200 dark:border-neutral-700",
                    "transition-colors duration-150 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                )}
            >
                <DraggableSubtaskBar
                    subtask={subtask}
                    timelineStart={timelineStart}
                    totalDays={totalDays}

                    workspaceId={workspaceId}
                    projectId={projectId}
                    currentUser={currentUser}
                    permissions={permissions}
                    onUpdate={(id, data) => onSubTaskUpdate?.(id, data)}
                />
            </div>
        </div>
    );
}

interface SortableSubtaskListProps {
    subtasks: GanttSubtask[];
    timelineStart: Date;
    totalDays: number;

    onSubtaskClick?: (subtaskId: string) => void;
    onSubTaskUpdate?: (subTaskId: string, data: Partial<any>) => void;
    workspaceId?: string;
    projectId?: string;
    members?: ProjectMembersType;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
    showDetails: boolean;
    allowedUserIds?: string[];
}

export function SortableSubtaskList({
    subtasks,
    timelineStart,
    totalDays,
    onSubtaskClick,
    onSubTaskUpdate,
    workspaceId,
    projectId,
    members,
    currentUser,
    permissions,
    showDetails,
    allowedUserIds
}: SortableSubtaskListProps) {
    return (
        <div className="flex flex-col">
            {subtasks.map((subtask) => (
                <SortableSubtaskRow
                    key={subtask.id}
                    subtask={subtask}
                    timelineStart={timelineStart}
                    totalDays={totalDays}
                    onSubtaskClick={onSubtaskClick}
                    onSubTaskUpdate={onSubTaskUpdate}
                    workspaceId={workspaceId}
                    projectId={projectId}
                    members={members}
                    currentUser={currentUser}
                    permissions={permissions}
                    showDetails={showDetails}
                    allowedUserIds={allowedUserIds}
                />
            ))}
        </div>
    );
}
