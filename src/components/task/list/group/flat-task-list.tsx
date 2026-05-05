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

    scrollContainerRef
}: FlatTaskListProps) {
    const [tasks, setTasks] = useState<TaskWithSubTasks[]>(initialTasks || []);

    useEffect(() => {
        setTasks(initialTasks || []);
    }, [initialTasks]);

    const handleTaskUpdated = useCallback((taskId: string, updatedTask: any) => {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updatedTask } : t));
    }, []);

    const handleTaskDeleted = useCallback((taskId: string) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
    }, []);

    const handleTaskCreated = useCallback((task: TaskWithSubTasks) => {
        setTasks(prev => [task, ...prev]);
        setActiveInlineProjectId(null);
    }, [setActiveInlineProjectId]);

    const handleSubTaskUpdated = useCallback((subTaskId: string, updatedData: any) => {
        setTasks(prev => prev.map(t => ({
            ...t,
            subTasks: t.subTasks ? t.subTasks.map(st => st.id === subTaskId ? { ...st, ...updatedData } : st) : []
        })));
    }, []);

    const handleSubTaskDeleted = useCallback((subTaskId: string, parentId: string) => {
        setTasks(prev => prev.map(t => t.id === parentId ? { ...t, subTasks: (t.subTasks || []).filter(st => st.id !== subTaskId) } : t));
    }, []);

    const handleSubTaskCreated = useCallback((subTask: any, parentId: string) => {
        setTasks(prev => prev.map(t => {
            if (t.id === parentId) {
                const currentSubTasks = t.subTasks || [];
                if (currentSubTasks.some((st: any) => st.id === subTask.id)) return t;
                return { ...t, subTasks: [...currentSubTasks, subTask] };
            }
            return t;
        }));
    }, []);

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
                        onSubTaskDeleted={(stId) => handleSubTaskDeleted(stId, task.id)}
                        onSubTaskCreated={(st) => handleSubTaskCreated(st, task.id)}
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
