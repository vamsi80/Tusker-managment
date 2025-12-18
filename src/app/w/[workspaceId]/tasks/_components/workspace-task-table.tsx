"use client";

import { TaskTable } from "@/app/w/[workspaceId]/p/[slug]/_components/list/task-table";
import { TaskPageWrapper } from "@/app/w/[workspaceId]/p/[slug]/_components/shared/task-page-wrapper";
import { WorkspaceTaskType } from "@/data/task/get-workspace-tasks";

interface WorkspaceTaskTableProps {
    tasks: WorkspaceTaskType;
    workspaceId: string;
    initialHasMore: boolean;
    initialTotalCount: number;
}

/**
 * Workspace Task Table
 * 
 * Reuses the existing project-level TaskTable component
 * Transforms workspace tasks to match the expected format
 * Supports pagination with "Load More" button
 */
export function WorkspaceTaskTable({
    tasks,
    workspaceId,
    initialHasMore,
    initialTotalCount,
}: WorkspaceTaskTableProps) {
    // Transform workspace tasks to match TaskWithSubTasks format
    // IMPORTANT: subTasks must be undefined (not empty array) for lazy-loading to work
    const transformedTasks = tasks.map(task => ({
        ...task,
        subTasks: undefined, // undefined = not loaded yet, will trigger fetch on expand
        createdBy: task.createdBy || { user: { name: '', surname: '', image: '' } },
        _count: {
            subTasks: task._count.subTasks,
        },
        // Store projectId in the task so TaskTable can use it for fetching subtasks
        projectId: task.projectId,
    }));

    return (
        <TaskPageWrapper>
            <TaskTable
                initialTasks={transformedTasks as any}
                initialHasMore={initialHasMore}
                initialTotalCount={initialTotalCount}
                members={[]}
                workspaceId={workspaceId}
                projectId={tasks[0]?.projectId || ""}
                canCreateSubTask={false}
                showAdvancedFilters={true}
            />
        </TaskPageWrapper>
    );
}
