"use client";

import { CornerDownRight } from "lucide-react";
import { DraggableSubtaskBar } from "./draggable-subtask-bar";
import { cn } from "@/lib/utils";
import { GanttSubtask } from "./types";

interface SortableSubtaskRowProps {
    subtask: GanttSubtask;
    timelineStart: Date;
    totalDays: number;

    onSubtaskClick?: (subtaskId: string) => void;
    workspaceId?: string;
    projectId?: string;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
}

function SortableSubtaskRow({
    subtask,
    timelineStart,
    totalDays,

    onSubtaskClick,
    workspaceId,
    projectId,
    currentUser,
    permissions
}: SortableSubtaskRowProps) {
    return (
        <div
            className="grid"
            style={{
                gridTemplateColumns: 'var(--gantt-sidebar-width) var(--gantt-total-width)',
            }}
        >
            {/* Left Panel - Subtask Name (No Drag Handle) */}
            <div
                className={cn(
                    "sticky left-0 z-30 flex items-center gap-1 px-2 py-1.5 pl-8 min-h-[32px]",
                    subtask.assignee ? "bg-neutral-50 dark:bg-neutral-800/30" : "bg-red-50 dark:bg-red-950/20 animate-[pulse_2s_infinite]",
                    "border-b border-r border-neutral-200 dark:border-neutral-700",
                    "transition-colors duration-150 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                )}
            >
                <CornerDownRight className="h-3 w-3 text-muted-foreground/30 shrink-0 mr-1" />
                <span
                    className="text-sm text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground hover:underline transition-colors"
                    onClick={() => onSubtaskClick?.(subtask.id)}
                    title="Click to view details"
                >
                    {subtask.name}
                </span>
                {!subtask.assignee && (
                    <span className="text-[10px] text-red-600 dark:text-red-400 font-bold bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded animate-pulse whitespace-nowrap ml-2 shrink-0">Unassigned</span>
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
                />
            </div>
        </div>
    );
}

interface SortableSubtaskListProps {
    subtasks: GanttSubtask[];
    timelineStart: Date;
    totalDays: number;
    // onReorder removed as per user request

    onSubtaskClick?: (subtaskId: string) => void;
    workspaceId?: string;
    projectId?: string;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
}

export function SortableSubtaskList({
    subtasks,
    timelineStart,
    totalDays,

    onSubtaskClick,
    workspaceId,
    projectId,
    currentUser,
    permissions,
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
                    workspaceId={workspaceId}
                    projectId={projectId}
                    currentUser={currentUser}
                    permissions={permissions}
                />
            ))}
        </div>
    );
}
