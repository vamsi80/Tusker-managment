"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { TaskRow } from "../task-row";
import { SubTaskList } from "../subtask-list";
import { InlineTaskForm } from "../inline-task-form";
import type { TaskWithSubTasks } from "../../shared/types";
import type { ColumnVisibility } from "../../shared/column-visibility";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";

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
    onUpdateParentTaskLists: (updatedList: TaskWithSubTasks[]) => void;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
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
    onUpdateParentTaskLists,
    scrollContainerRef
}: FlatTaskListProps) {
    const [localTasks, setLocalTasks] = useState<TaskWithSubTasks[]>(initialTasks);

    // Sync upstream on updates (like global filters altering the list)
    useEffect(() => {
        setLocalTasks(initialTasks);
    }, [initialTasks]);

    // Trigger parent sync for caching/other UI updates, using local state as truth
    const flushToParent = useCallback((newList: TaskWithSubTasks[]) => {
        onUpdateParentTaskLists(newList);
    }, [onUpdateParentTaskLists]);

    const handleTaskUpdated = useCallback((taskId: string, updatedTask: { name: string; taskSlug: string }) => {
        const next = localTasks.map(t =>
            t.id === taskId
                ? { ...t, name: updatedTask.name, taskSlug: updatedTask.taskSlug }
                : t
        );
        setLocalTasks(next);
        flushToParent(next);
    }, [localTasks, flushToParent]);

    const handleTaskDeleted = useCallback((taskId: string) => {
        const next = localTasks.filter(t => t.id !== taskId);
        setLocalTasks(next);
        flushToParent(next);
    }, [localTasks, flushToParent]);

    const handleTaskCreated = useCallback((task: TaskWithSubTasks, tempId?: string) => {
        let next;
        if (tempId) {
            next = localTasks.map(t => t.id === tempId ? task : t);
        } else {
            next = [task, ...localTasks];
        }
        setLocalTasks(next);
        flushToParent(next);
        setActiveInlineProjectId(null);
    }, [localTasks, flushToParent, setActiveInlineProjectId]);

    const handleSubTaskUpdated = useCallback((subTaskId: string, updatedData: any) => {
        const next = localTasks.map(t => ({
            ...t,
            subTasks: t.subTasks?.map(st => st.id === subTaskId ? { ...st, ...updatedData } : st)
        }));

        // Also notify global store for cross-view consistency
        useTaskCacheStore.getState().upsertTasks([updatedData]);
        setLocalTasks(next);
        flushToParent(next);
    }, [localTasks, flushToParent]);

    const handleSubTaskDeleted = useCallback((subTaskId: string) => {
        const next = localTasks.map(t => ({
            ...t,
            subTasks: t.subTasks?.filter(st => st.id !== subTaskId)
        }));
        setLocalTasks(next);
        flushToParent(next);
    }, [localTasks, flushToParent]);

    const handleSubTaskCreated = useCallback((subTask: any, parentId: string, tempId?: string) => {
        const next = localTasks.map(t => {
            if (t.id !== parentId) return t;

            const currentSubTasks = t.subTasks || [];
            let newSubTasks;
            if (tempId) {
                newSubTasks = currentSubTasks.map(st => st.id === tempId ? subTask : st);
            } else {
                newSubTasks = [subTask, ...currentSubTasks];
            }

            return { ...t, subTasks: newSubTasks };
        });

        // Also notify global store for cross-view consistency and hydration persistence
        useTaskCacheStore.getState().addSubTaskToList(parentId, subTask, tempId);
        
        setLocalTasks(next);
        flushToParent(next);
    }, [localTasks, flushToParent]);

    return (
        <>
            {localTasks.map((task) => (
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
                    projects={projects}
                    onRequestSubtasks={onRequestSubtasks}
                    isCached={!!getCachedSubTasks(task.id)}
                    scrollContainerRef={scrollContainerRef}
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
                        onSubTaskDeleted={handleSubTaskDeleted}
                        onSubTaskCreated={(st, tempId) => handleSubTaskCreated(st, task.id, tempId)}
                        permissions={permissions}
                        userId={userId}
                        isWorkspaceAdmin={isWorkspaceAdmin}
                        leadProjectIds={leadProjectIds}
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
