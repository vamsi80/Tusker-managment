"use client";

import { WorkspaceTaskType } from "@/data/task/get-workspace-tasks";
import { WorkspaceTaskTable } from "./workspace-task-table";

interface WorkspaceTaskTableWrapperProps {
    tasks: WorkspaceTaskType;
    workspaceId: string;
    initialHasMore: boolean;
    initialTotalCount: number;
}

/**
 * Workspace Task Table Wrapper
 * 
 * Simple wrapper that passes tasks to the table component
 * Filtering is handled by the project-level TaskTableToolbar
 */
export function WorkspaceTaskTableWrapper({
    tasks,
    workspaceId,
    initialHasMore,
    initialTotalCount,
}: WorkspaceTaskTableWrapperProps) {
    return (
        <WorkspaceTaskTable
            tasks={tasks}
            workspaceId={workspaceId}
            initialHasMore={initialHasMore}
            initialTotalCount={initialTotalCount}
        />
    );
}
