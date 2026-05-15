"use client";

import React, { useCallback } from "react";
import { Plus } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { ProjectRow } from "../project-row";
import { TaskRow } from "../task-row";
import { SubTaskList } from "../subtask-list";
import { InlineTaskForm } from "../inline-task-form";
import { TableLoadingSkeleton } from "../table/table-skeleton";
import { EmptyState } from "../table/empty-state";
import type { TaskWithSubTasks } from "../../shared/types";
import type { ColumnVisibility } from "../../shared/column-visibility";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";

interface ProjectTaskGroupProps {
    projectId: string;
    project: any;
    initialTasks: TaskWithSubTasks[];
    totalTasksCount: number;
    isExpanded: boolean;
    onToggle: () => void;
    visibleColumnsCount: number;
    columnVisibility: ColumnVisibility;
    expandedTasks: Record<string, boolean>;
    onToggleExpandTask: (taskId: string) => void;
    updatingTaskId: string | null;
    setUpdatingTaskId: (id: string | null) => void;
    permissions?: UserPermissionsType;
    userId?: string;
    isWorkspaceAdmin?: boolean;
    leadProjectIds?: string[];
    projects?: any[];
    projectMap: Record<string, any>;
    onRequestSubtasks: (taskId: string) => void;
    getCachedSubTasks: (taskId: string) => any;
    tags: any[];
    members: any[];
    workspaceId: string;
    canCreateSubTask: boolean;
    loadingSubTasks: Record<string, boolean>;
    loadingMoreSubTasks: Record<string, boolean>;
    onLoadMoreSubTasks: (taskId: string) => void;
    handleSubTaskClick: (subTask: any) => void;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    level: "workspace" | "project";
    paginationState?: { isLoading: boolean; hasMore: boolean; nextCursor?: any };
    observer: IntersectionObserver | null;
    filtersActive: boolean;
    activeInlineProjectId: string | null;
    setActiveInlineProjectId: (id: string | null) => void;
    onTasksChange?: (update: any) => void;
    onSubTaskUpdated?: (subTaskId: string, updatedData: any) => void;
    onEnsureProjectLoad?: (projectId: string) => void;
}

export function ProjectTaskGroup({
    projectId,
    project,
    initialTasks,
    totalTasksCount,
    isExpanded,
    onToggle,
    visibleColumnsCount,
    columnVisibility,
    expandedTasks,
    onToggleExpandTask,
    updatingTaskId,
    setUpdatingTaskId,
    permissions,
    userId,
    isWorkspaceAdmin,
    leadProjectIds,
    projects,
    onRequestSubtasks,
    getCachedSubTasks,
    tags,
    members,
    workspaceId,
    canCreateSubTask,
    loadingSubTasks,
    loadingMoreSubTasks,
    onLoadMoreSubTasks,
    handleSubTaskClick,
    scrollContainerRef,
    level,
    paginationState = { isLoading: false, hasMore: true },
    observer,
    filtersActive,
    activeInlineProjectId,
    setActiveInlineProjectId,
    projectMap,
    onTasksChange,
    onSubTaskUpdated,
}: ProjectTaskGroupProps) {
    const tasks = initialTasks || [];

    const handleTaskUpdated = useCallback((taskId: string, updatedTask: any) => {
        if (onTasksChange) onTasksChange((prev: any) => prev.map((t: any) => t.id === taskId ? { ...t, ...updatedTask } : t));
    }, [onTasksChange]);

    const handleSubTaskUpdated = useCallback((subTaskId: string, updatedData: any) => {
        if (onTasksChange) onTasksChange((prev: any) => prev.map((t: any) => ({
            ...t,
            subTasks: t.subTasks ? t.subTasks.map((st: any) => st.id === subTaskId ? { ...st, ...updatedData } : st) : []
        })));
        if (onSubTaskUpdated) onSubTaskUpdated(subTaskId, updatedData);
    }, [onTasksChange, onSubTaskUpdated]);

    const handleSubTaskDeleted = useCallback((subTaskId: string, parentId: string) => {
        if (onTasksChange) onTasksChange((prev: any) => prev.map((t: any) => t.id === parentId ? { ...t, subTasks: (t.subTasks || []).filter((st: any) => st.id !== subTaskId) } : t));
    }, [onTasksChange]);

    const handleSubTaskCreated = useCallback((subTask: any, parentId: string) => {
        if (onTasksChange) onTasksChange((prev: any) => prev.map((t: any) => {
            if (t.id === parentId) {
                const currentSubTasks = t.subTasks || [];
                if (currentSubTasks.some((st: any) => st.id === subTask.id)) return t;
                return { ...t, subTasks: [...currentSubTasks, subTask] };
            }
            return t;
        }));
    }, [onTasksChange]);

    const handleTaskDeleted = useCallback((taskId: string) => {
        if (onTasksChange) onTasksChange((prev: any) => prev.filter((t: any) => t.id !== taskId));
    }, [onTasksChange]);

    const handleTaskCreated = useCallback((task: TaskWithSubTasks) => {
        if (onTasksChange) onTasksChange((prev: any) => {
            if (prev.some((t: any) => t.id === task.id)) return prev;
            return [task, ...prev];
        });
        setActiveInlineProjectId(null);
    }, [setActiveInlineProjectId, onTasksChange]);

    return (
        <ProjectRow
            project={project}
            totalTasksCount={totalTasksCount}
            isExpanded={isExpanded}
            onToggle={onToggle}
            colSpan={visibleColumnsCount}
        >
            {isExpanded && tasks?.map((task) => (
                <React.Fragment key={task.id}>
                    <TaskRow
                        task={task}
                        isExpanded={!!expandedTasks[task.id]}
                        onToggleExpand={() => onToggleExpandTask(task.id)}
                        columnVisibility={columnVisibility}
                        isUpdating={updatingTaskId === task.id}
                        onUpdateStart={() => setUpdatingTaskId(task.id)}
                        onUpdateEnd={() => setUpdatingTaskId(null)}
                        onTaskUpdated={(updatedTask) => handleTaskUpdated(task.id, updatedTask)}
                        onTaskDeleted={handleTaskDeleted}
                        permissions={permissions}
                        userId={userId}
                        isWorkspaceAdmin={isWorkspaceAdmin}
                        leadProjectIds={leadProjectIds}
                        projects={projects}
                        onRequestSubtasks={onRequestSubtasks}
                        isCached={!!getCachedSubTasks(task.id)}
                    >
                        <SubTaskList
                            task={task}
                            tags={tags}
                            members={members}
                            workspaceId={workspaceId}
                            projectId={task.projectId || projectId}
                            canCreateSubTask={
                                level === 'project'
                                    ? canCreateSubTask
                                    : (canCreateSubTask && task.projectId ? (
                                        leadProjectIds?.includes(task.projectId) ||
                                        !!isWorkspaceAdmin ||
                                        !!projects?.find(p => p.id === task.projectId)?.canManageMembers
                                    ) : false)
                            }
                            columnVisibility={columnVisibility}
                            isLoading={!!loadingSubTasks[task.id]}
                            isLoadingMore={!!loadingMoreSubTasks[task.id]}
                            onLoadMore={() => onLoadMoreSubTasks(task.id)}
                            onSubTaskClick={handleSubTaskClick}
                            onSubTaskUpdated={handleSubTaskUpdated}
                            onSubTaskDeleted={(stId) => handleSubTaskDeleted(stId, task.id)}
                            onSubTaskCreated={(st) => handleSubTaskCreated(st, task.id)}
                            permissions={permissions}
                            userId={userId}
                            isWorkspaceAdmin={isWorkspaceAdmin}
                            leadProjectIds={leadProjectIds}
                            projects={projects}
                            projectMap={projectMap}
                            scrollContainerRef={scrollContainerRef}
                            level={level}
                        />
                    </TaskRow>
                </React.Fragment>
            ))}

            {isExpanded && paginationState.isLoading && tasks.length === 0 && (
                <TableLoadingSkeleton visibleColumnsCount={visibleColumnsCount} />
            )}

            {/* 🎯 Hydration Sentinel: Triggers the first fetch for an empty expanded project when it enters view */}
            {isExpanded && !paginationState.isLoading && tasks.length === 0 && paginationState.hasMore && (
                <TableRow
                    key={`sentinel-init-${filtersActive}-${tasks.length}`}
                    ref={(node) => {
                        if (node && observer) observer.observe(node);
                    }}
                    data-project-id={projectId}
                    className="hover:bg-transparent border-0"
                >
                    <TableCell colSpan={visibleColumnsCount} className="py-0 px-2 h-32">
                        {/* Invisible trigger with height to prevent 'Expand All' fetch storms */}
                    </TableCell>
                </TableRow>
            )}

            {isExpanded && paginationState.hasMore && paginationState.isLoading && tasks.length > 0 && (
                <TableLoadingSkeleton visibleColumnsCount={visibleColumnsCount} count={5} />
            )}

            {isExpanded && paginationState.hasMore && !paginationState.isLoading && (
                <TableRow
                    key={`sentinel-more-${filtersActive}-${tasks.length}`}
                    ref={(node) => {
                        if (node && observer) observer.observe(node);
                    }}
                    data-project-id={projectId}
                >
                    <TableCell colSpan={visibleColumnsCount} className="py-2 h-1"></TableCell>
                </TableRow>
            )}

            {isExpanded && !paginationState.isLoading && tasks.length === 0 && totalTasksCount === 0 && (
                (filtersActive || !canCreateSubTask) ? (
                    <EmptyState visibleColumnsCount={visibleColumnsCount} />
                ) : null
            )}

            {isExpanded && canCreateSubTask && !filtersActive && (
                activeInlineProjectId === projectId ? (
                    <InlineTaskForm
                        workspaceId={workspaceId}
                        projectId={projectId}
                        projects={projects}
                        level={level}
                        leadProjectIds={leadProjectIds || []}
                        isWorkspaceAdmin={isWorkspaceAdmin}
                        onCancel={() => setActiveInlineProjectId(null)}
                        onTaskDeleted={handleTaskDeleted}
                        onTaskCreated={handleTaskCreated}
                        visibleColumnsCount={visibleColumnsCount}
                    />
                ) : (
                    <TableRow
                        className="hover:bg-muted/20 cursor-pointer h-8"
                        onClick={(e) => { e.stopPropagation(); setActiveInlineProjectId(projectId); }}
                    >
                        <TableCell colSpan={visibleColumnsCount} className="py-2 px-2 pl-8">
                            <div className="flex items-center gap-2 text-primary font-medium hover:text-primary/80 transition-colors">
                                <Plus className="h-4 w-4" />
                                <span>Add Task</span>
                            </div>
                        </TableCell>
                    </TableRow>
                )
            )}
        </ProjectRow>
    );
}
