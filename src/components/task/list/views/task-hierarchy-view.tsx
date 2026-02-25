"use client";

import React from "react";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { TaskRow } from "../task-row";
import { ProjectRow } from "../project-row";
import { SubTaskList } from "../subtask-list";
import { TableRow, TableCell } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { InlineTaskForm } from "../inline-task-form";

interface TaskHierarchyViewProps {
    tasks: TaskWithSubTasks[];
    expanded: Record<string, boolean>;
    toggleExpand: (id: string) => void;
    columnVisibility: any;
    visibleColumnsCount: number;
    projects: any[];
    permissions: any;
    userId: string;
    workspaceId: string;
    projectId: string;
    isWorkspaceAdmin: boolean;
    leadProjectIds: string[];
    canCreateSubTask: boolean;
    activeInlineProjectId: string | null;
    setActiveInlineProjectId: (id: string | null) => void;
    handleRequestSubtasks: (taskId: string) => void;
    getCachedSubTasks: (taskId: string) => any;
    loadingSubTasks: Record<string, boolean>;
    loadingMoreSubTasks: Record<string, boolean>;
    loadMoreSubTasks: (taskId: string) => void;
    handleSubTaskClick: (subTask: any) => void;
    handleSubTaskUpdated: (taskId: string, subTaskId: string, updatedData: any) => void;
    handleSubTaskDeleted: (taskId: string, subTaskId: string) => void;
    handleSubTaskCreated: (taskId: string, newSubTask: any, tempId?: string) => void;
    setTasks: React.Dispatch<React.SetStateAction<TaskWithSubTasks[]>>;
    updatingTaskId: string | null;
    setUpdatingTaskId: (id: string | null) => void;
    level: "workspace" | "project";
    searchQuery: string;
    filters: any;
}

export function TaskHierarchyView({
    tasks,
    expanded,
    toggleExpand,
    columnVisibility,
    visibleColumnsCount,
    projects,
    permissions,
    userId,
    workspaceId,
    projectId,
    isWorkspaceAdmin,
    leadProjectIds,
    canCreateSubTask,
    activeInlineProjectId,
    setActiveInlineProjectId,
    handleRequestSubtasks,
    getCachedSubTasks,
    loadingSubTasks,
    loadingMoreSubTasks,
    loadMoreSubTasks,
    handleSubTaskClick,
    handleSubTaskUpdated,
    handleSubTaskDeleted,
    handleSubTaskCreated,
    setTasks,
    updatingTaskId,
    setUpdatingTaskId,
    level,
    searchQuery,
    filters,
}: TaskHierarchyViewProps) {
    // Note: Project grouping is handled here if level is workspace
    // But if we are in Hierarchy view, we might want to still group by project?
    // In the legacy TaskTable, it groups by project if it's workspace level.

    const groupedTasks = React.useMemo(() => {
        if (level !== "workspace") return { [projectId]: tasks };

        const groups: Record<string, TaskWithSubTasks[]> = {};
        projects.forEach(project => {
            groups[project.id] = [];
        });
        tasks.forEach((task) => {
            const pId = task.projectId || 'unknown';
            if (!groups[pId]) groups[pId] = [];
            groups[pId].push(task);
        });
        return groups;
    }, [tasks, level, projects, projectId]);

    return (
        <>
            {Object.entries(groupedTasks).map(([pId, projectTasks]) => {
                const project = projects?.find(p => p.id === pId);
                if (pId === 'unknown' && projectTasks.length === 0) return null;

                const isProjectExpanded = expanded[pId] !== false;

                return (
                    <React.Fragment key={pId}>
                        <ProjectRow
                            project={project || { id: pId, name: "Unknown Project" }}
                            totalTasksCount={projectTasks.length}
                            isExpanded={isProjectExpanded}
                            onToggle={() => toggleExpand(pId)}
                            colSpan={visibleColumnsCount}
                        >
                            {isProjectExpanded && projectTasks.map((task) => (
                                <React.Fragment key={task.id}>
                                    <TaskRow
                                        task={task}
                                        isExpanded={!!expanded[task.id]}
                                        onToggleExpand={() => toggleExpand(task.id)}
                                        columnVisibility={columnVisibility}
                                        isUpdating={updatingTaskId === task.id}
                                        onUpdateStart={() => setUpdatingTaskId(task.id)}
                                        onUpdateEnd={() => setUpdatingTaskId(null)}
                                        onTaskUpdated={(updatedTask) => {
                                            setTasks(prevTasks =>
                                                prevTasks.map(t =>
                                                    t.id === task.id
                                                        ? { ...t, ...updatedTask }
                                                        : t
                                                )
                                            );
                                        }}
                                        onTaskDeleted={(taskId) => {
                                            setTasks(prevTasks =>
                                                prevTasks.filter(t => t.id !== taskId)
                                            );
                                        }}
                                        permissions={permissions}
                                        userId={userId}
                                        isWorkspaceAdmin={isWorkspaceAdmin}
                                        leadProjectIds={leadProjectIds}
                                        projects={projects}
                                        onRequestSubtasks={handleRequestSubtasks}
                                        isCached={!!getCachedSubTasks(task.id)}
                                    >
                                        <SubTaskList
                                            task={task}
                                            tags={[]} // Tags should probably be passed down
                                            members={[]} // Members should probably be passed down
                                            workspaceId={workspaceId}
                                            projectId={task.projectId || pId}
                                            canCreateSubTask={
                                                level === 'project'
                                                    ? canCreateSubTask
                                                    : (canCreateSubTask && task.projectId ? (
                                                        leadProjectIds.includes(task.projectId) ||
                                                        !!isWorkspaceAdmin ||
                                                        !!projects?.find(p => p.id === task.projectId)?.canManageMembers
                                                    ) : false)
                                            }
                                            columnVisibility={columnVisibility}
                                            isLoading={!!loadingSubTasks[task.id]}
                                            isLoadingMore={!!loadingMoreSubTasks[task.id]}
                                            onLoadMore={() => loadMoreSubTasks(task.id)}
                                            onSubTaskClick={handleSubTaskClick}
                                            onSubTaskUpdated={(subTaskId, updatedData) =>
                                                handleSubTaskUpdated(task.id, subTaskId, updatedData)
                                            }
                                            onSubTaskDeleted={(subTaskId) =>
                                                handleSubTaskDeleted(task.id, subTaskId)
                                            }
                                            onSubTaskCreated={(newSubTask, tempId) =>
                                                handleSubTaskCreated(task.id, newSubTask, tempId)
                                            }
                                            permissions={permissions}
                                            userId={userId}
                                            isWorkspaceAdmin={isWorkspaceAdmin}
                                            leadProjectIds={leadProjectIds}
                                            projects={projects}
                                            level={level}
                                        />
                                    </TaskRow>
                                </React.Fragment>
                            ))}

                            {isProjectExpanded && canCreateSubTask && !searchQuery && Object.keys(filters).length === 0 && (
                                activeInlineProjectId === pId ? (
                                    <InlineTaskForm
                                        workspaceId={workspaceId}
                                        projectId={pId}
                                        projects={projects}
                                        level={level}
                                        leadProjectIds={leadProjectIds}
                                        isWorkspaceAdmin={isWorkspaceAdmin}
                                        onCancel={() => setActiveInlineProjectId(null)}
                                        onTaskCreated={(task, tempId) => {
                                            if (tempId) {
                                                setTasks(prev => prev.map(t => t.id === tempId ? task : t));
                                            } else {
                                                setTasks(prev => [task, ...prev]);
                                            }
                                            setActiveInlineProjectId(null);
                                        }}
                                    />
                                ) : (
                                    <TableRow
                                        className="hover:bg-muted/20 cursor-pointer h-8"
                                        onClick={(e) => { e.stopPropagation(); setActiveInlineProjectId(pId); }}
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
                    </React.Fragment>
                );
            })}
        </>
    );
}
