"use client";

import React, { useMemo } from "react";
import { useTaskPagination } from "@/hooks/use-task-pagination";
import { TaskHierarchyView } from "./task-hierarchy-view";
import { TaskWithSubTasks, TaskFilters } from "@/components/task/shared/types";
import { InfiniteScrollObserver } from "@/components/shared/infinite-scroll-observer";

interface ProjectTasksContainerProps {
    workspaceId: string;
    projectId: string;
    filters: TaskFilters;
    columnVisibility: any;
    visibleColumnsCount: number;
    projects: any[];
    permissions: any;
    userId: string;
    isWorkspaceAdmin: boolean;
    leadProjectIds: string[];
    canCreateSubTask: boolean;
    searchQuery: string;
    activeInlineProjectId: string | null;
    setActiveInlineProjectId: (id: string | null) => void;
    setTasks: React.Dispatch<React.SetStateAction<TaskWithSubTasks[]>>;
    handleSubTaskClick: (task: any) => void;
    handleRequestSubtasks: (taskId: string) => void;
    getCachedSubTasks: (taskId: string) => any;
    loadingSubTasks: Record<string, boolean>;
    loadingMoreSubTasks: Record<string, boolean>;
    loadMoreSubTasks: (taskId: string) => void;
    handleSubTaskUpdated: (taskId: string, subTaskId: string, data: any) => void;
    handleSubTaskDeleted: (taskId: string, subTaskId: string) => void;
    handleSubTaskCreated: (taskId: string, subTask: any, tempId?: string) => void;
    updatingTaskId: string | null;
    setUpdatingTaskId: (id: string | null) => void;
    expanded: Record<string, boolean>;
    toggleExpand: (id: string) => void;
}

/**
 * Loads and renders a paginated list of tasks for a single project.
 * Used within WorkspaceProjectGroupView to provide per-project isolation/scalability.
 */
export function ProjectTasksContainer({
    workspaceId,
    projectId,
    filters,
    ...props
}: ProjectTasksContainerProps) {
    // Each project manages its own loading state and pagination
    const { tasks, setTasks, pagination } = useTaskPagination({
        workspaceId,
        projectId,
        filters,
        pageSize: 10,
    });

    if (pagination.isLoading && tasks.length === 0) {
        return (
            <tr className="animate-pulse">
                <td colSpan={props.visibleColumnsCount} className="py-4 text-center text-muted-foreground">
                    Loading project tasks...
                </td>
            </tr>
        );
    }

    if (tasks.length === 0 && !pagination.isLoading) {
        return null; // Don't show anything if no tasks match in this project
    }

    return (
        <>
            <TaskHierarchyView
                {...props}
                tasks={tasks as TaskWithSubTasks[]}
                workspaceId={workspaceId}
                projectId={projectId}
                setTasks={setTasks}
                filters={filters}
                searchQuery={props.searchQuery}
                level="project" // Internal view is always project-scoped
            />
            <InfiniteScrollObserver
                onIntersect={pagination.loadMore}
                isLoading={pagination.isLoadingMore}
                hasMore={pagination.hasMore}
            />
        </>
    );
}
