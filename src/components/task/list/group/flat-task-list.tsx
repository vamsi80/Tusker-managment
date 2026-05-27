"use client";

import React, { useCallback } from "react";
import { Plus } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { TaskRow } from "../task-row";
import { SubTaskList } from "../subtask-list";
import { InlineTaskForm } from "../inline-task-form";
import type { TaskWithSubTasks } from "../../shared/types";
import type { ColumnVisibility } from "../../shared/column-visibility";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";


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
    projects?: any[];
    onRequestSubtasks: (taskId: string) => void;
    getCachedSubTasks: (taskId: string) => any;
    tags: any[];
    members: any[];
    workspaceId: string;
    projectId: string; // the default or active context project
    canCreateSubTask: boolean;
    loadingSubTasks: Record<string, boolean>;
    loadingMoreSubTasks: Record<string, boolean>;
    onLoadMoreSubTasks: (taskId: string) => void;
    handleSubTaskClick: (subTask: any) => void;
    level: "workspace" | "project";
    filtersActive: boolean;
    activeInlineProjectId: string | null;
    setActiveInlineProjectId: (id: string | null) => void;
    onTasksChange?: (update: any) => void;
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

    const handleTaskUpdated = useCallback((taskId: string, updatedTask: any) => {
        if (onTasksChange) onTasksChange((prev: any) => prev.map((t: any) => t.id === taskId ? { ...t, ...updatedTask } : t));
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

    const handleSubTaskUpdated = useCallback((subTaskId: string, updatedData: any) => {
        if (onTasksChange) onTasksChange((prev: any) => prev.map((t: any) => ({
            ...t,
            subTasks: t.subTasks ? t.subTasks.map((st: any) => st.id === subTaskId ? { ...st, ...updatedData } : st) : []
        })));
    }, [onTasksChange]);

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

    const handleSubTasksReordered = useCallback((parentId: string, newSubTasks: any[]) => {
        if (onTasksChange) onTasksChange((prev: any) => prev.map((t: any) => t.id === parentId ? { ...t, subTasks: newSubTasks } : t));
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
                                <Plus className="h-4 w-4" />
                                <span>Add Task</span>
                            </div>
                        </TableCell>
                    </TableRow>
                )
            )}
        </>
    );
}
