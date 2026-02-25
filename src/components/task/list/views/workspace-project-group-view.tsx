"use client";

import React from "react";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { ProjectRow } from "../project-row";
import { TableRow, TableCell } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { InlineTaskForm } from "../inline-task-form";
import { ProjectTasksContainer } from "./project-tasks-container";

interface WorkspaceProjectGroupViewProps {
    groupedTasks: Record<string, any[]>;
    expanded: Record<string, boolean>;
    toggleExpand: (id: string) => void;
    columnVisibility: any;
    visibleColumnsCount: number;
    projects: any[];
    canCreateSubTask: boolean;
    workspaceId: string;
    level: "workspace" | "project";
    isWorkspaceAdmin: boolean;
    leadProjectIds: string[];
    searchQuery: string;
    filters: any;
    activeInlineProjectId: string | null;
    setActiveInlineProjectId: (id: string | null) => void;
    setTasks: React.Dispatch<React.SetStateAction<TaskWithSubTasks[]>>;
    permissions: any;
    userId: string;
    handleRequestSubtasks: (taskId: string) => void;
    getCachedSubTasks: (taskId: string) => any;
    loadingSubTasks: Record<string, boolean>;
    loadingMoreSubTasks: Record<string, boolean>;
    loadMoreSubTasks: (taskId: string) => void;
    handleSubTaskClick: (task: any) => void;
    handleSubTaskUpdated: (taskId: string, subTaskId: string, data: any) => void;
    handleSubTaskDeleted: (taskId: string, subTaskId: string) => void;
    handleSubTaskCreated: (taskId: string, subTask: any, tempId?: string) => void;
    updatingTaskId: string | null;
    setUpdatingTaskId: (id: string | null) => void;
}

export function WorkspaceProjectGroupView({
    groupedTasks,
    expanded,
    toggleExpand,
    columnVisibility,
    visibleColumnsCount,
    projects,
    canCreateSubTask,
    workspaceId,
    level,
    isWorkspaceAdmin,
    leadProjectIds,
    searchQuery,
    filters,
    activeInlineProjectId,
    setActiveInlineProjectId,
    setTasks,
    ...props
}: WorkspaceProjectGroupViewProps) {
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
                            {isProjectExpanded && (
                                <ProjectTasksContainer
                                    {...props}
                                    workspaceId={workspaceId}
                                    projectId={pId}
                                    filters={{
                                        ...filters,
                                        search: searchQuery,
                                    }}
                                    searchQuery={searchQuery}
                                    columnVisibility={columnVisibility}
                                    visibleColumnsCount={visibleColumnsCount}
                                    projects={projects}
                                    expanded={expanded}
                                    toggleExpand={toggleExpand}
                                    canCreateSubTask={canCreateSubTask}
                                    isWorkspaceAdmin={isWorkspaceAdmin}
                                    leadProjectIds={leadProjectIds}
                                    activeInlineProjectId={activeInlineProjectId}
                                    setActiveInlineProjectId={setActiveInlineProjectId}
                                    setTasks={setTasks}
                                />
                            )}

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
