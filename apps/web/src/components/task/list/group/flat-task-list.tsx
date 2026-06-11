"use client";

import React, { useCallback } from "react";
import { Plus } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { TaskRow } from "../task-row";
import { SubTaskList } from "../subtask-list";
import { InlineTaskForm } from "../inline-task-form";
import type { TaskWithSubTasks } from "../../shared/types";
import type { ColumnVisibility } from "../../shared/column-visibility";
import type { UserPermissionsType } from "@/types/workspace";
import type { SubTaskType } from "@/types/task";
import type { ProjectMembersType } from "@/types/project";
import type { ProjectOption, TasksChangeUpdater } from "@/types/task-components";


interface FlatTaskListProps {
    initialTasks: TaskWithSubTasks[];
    columnVisibility: ColumnVisibility;
    visibleColumnsCount: number;
    expandedTasks: Record<string, boolean>;
    onToggleExpandTask: (taskId: string) => void;
    updatingTaskId: string | null;
    setUpdatingTaskId: (id: string | null) => void;
    permissions?: UserPermissionsType;
    userId?: string;
    isWorkspaceAdmin?: boolean;
    leadProjectIds?: string[];
    coordinatorProjectIds?: string[];
    projects?: ProjectOption[];
    onRequestSubtasks: (taskId: string) => void;
    getCachedSubTasks: (taskId: string) => TaskWithSubTasks | undefined;
    tags: Array<{ id: string; name: string }>;
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string; // the default or active context project
    canCreateSubTask: boolean;
    loadingSubTasks: Record<string, boolean>;
    loadingMoreSubTasks: Record<string, boolean>;
    onLoadMoreSubTasks: (taskId: string) => void;
    handleSubTaskClick: (subTask: SubTaskType) => void;
    level: "workspace" | "project";
    filtersActive: boolean;
    activeInlineProjectId: string | null;
    setActiveInlineProjectId: (id: string | null) => void;
    onTasksChange?: (update: TasksChangeUpdater) => void;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    isSubTaskRow?: boolean;
}

export function FlatTaskList({
    initialTasks,
    columnVisibility,
    visibleColumnsCount,
    expandedTasks,
    onToggleExpandTask,
    updatingTaskId,
    setUpdatingTaskId,
    permissions,
    userId,
    isWorkspaceAdmin,
    leadProjectIds,
    coordinatorProjectIds,
    projects,
    onRequestSubtasks,
    getCachedSubTasks,
    tags,
    members,
    workspaceId,
    projectId,
    canCreateSubTask,
    loadingSubTasks,
    loadingMoreSubTasks,
    onLoadMoreSubTasks,
    handleSubTaskClick,
    level,
    filtersActive,
    activeInlineProjectId,
    setActiveInlineProjectId,
    onTasksChange,
    scrollContainerRef,
    isSubTaskRow = false
}: FlatTaskListProps) {
    const tasks = initialTasks || [];

    const handleTaskUpdated = useCallback((taskId: string, updatedTask: Partial<TaskWithSubTasks>) => {
        if (onTasksChange) onTasksChange((prev) => prev.map((t) => t.id === taskId ? { ...t, ...updatedTask } : t));
    }, [onTasksChange]);

    const handleTaskDeleted = useCallback((taskId: string) => {
        if (onTasksChange) onTasksChange((prev) => prev.filter((t) => t.id !== taskId));
    }, [onTasksChange]);

    const handleTaskCreated = useCallback((task: TaskWithSubTasks) => {
        if (onTasksChange) onTasksChange((prev) => {
            if (prev.some((t) => t.id === task.id)) return prev;
            return [task, ...prev];
        });
        setActiveInlineProjectId(null);
    }, [setActiveInlineProjectId, onTasksChange]);

    const handleSubTaskUpdated = useCallback((subTaskId: string, updatedData: Partial<SubTaskType>) => {
        if (onTasksChange) onTasksChange((prev) => prev.map((t) => ({
            ...t,
            subTasks: t.subTasks ? t.subTasks.map((st) => st.id === subTaskId ? { ...st, ...updatedData } : st) : []
        })));
    }, [onTasksChange]);

    const handleSubTaskDeleted = useCallback((subTaskId: string, parentId: string) => {
        if (onTasksChange) onTasksChange((prev) => prev.map((t) => t.id === parentId ? { ...t, subTasks: (t.subTasks || []).filter((st) => st.id !== subTaskId) } : t));
    }, [onTasksChange]);

    const handleSubTaskCreated = useCallback((subTask: SubTaskType, parentId: string) => {
        if (onTasksChange) onTasksChange((prev) => prev.map((t) => {
            if (t.id === parentId) {
                const currentSubTasks = t.subTasks || [];
                if (currentSubTasks.some((st) => st.id === subTask.id)) return t;
                return { ...t, subTasks: [...currentSubTasks, subTask] };
            }
            return t;
        }));
    }, [onTasksChange]);

    const handleSubTasksReordered = useCallback((parentId: string, newSubTasks: SubTaskType[]) => {
        if (onTasksChange) onTasksChange((prev) => prev.map((t) => t.id === parentId ? { ...t, subTasks: newSubTasks } : t));
    }, [onTasksChange]);

    return (
        <>
            {tasks?.map((task) => (
                <TaskRow
                    key={task.id}
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
                    coordinatorProjectIds={coordinatorProjectIds}
                    projects={projects}
                    onRequestSubtasks={onRequestSubtasks}
                    isCached={!!getCachedSubTasks(task.id)}
                    scrollContainerRef={scrollContainerRef}
                    isSubtaskRow={isSubTaskRow}
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
                                            coordinatorProjectIds?.includes(task.projectId) ||
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
                        onSubTasksReordered={(parentId, newSubTasks) => handleSubTasksReordered(parentId, newSubTasks)}
                        permissions={permissions}
                        userId={userId}
                        isWorkspaceAdmin={isWorkspaceAdmin}
                        leadProjectIds={leadProjectIds}
                        coordinatorProjectIds={coordinatorProjectIds}
                        projects={projects}
                        scrollContainerRef={scrollContainerRef}
                        level={level}
                    />
                </TaskRow>
            ))}

            {canCreateSubTask && !filtersActive && (
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
                        onClick={() => setActiveInlineProjectId(projectId)}
                    >
                        <TableCell colSpan={visibleColumnsCount} className="py-2 px-2 text-muted-foreground">
                            <div className="flex items-center gap-2 text-primary font-medium hover:text-primary/80 transition-colors">
                                <Plus className="size-4" />
                                <span>Add Task</span>
                            </div>
                        </TableCell>
                    </TableRow>
                )
            )}
        </>
    );
}

