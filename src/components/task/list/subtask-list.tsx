"use client";

import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronsDown, Plus } from "lucide-react";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { SubTaskType } from "@/data/task/list/get-subtasks";
import { ColumnVisibility } from "../shared/column-visibility";
import { SubTaskSkeleton } from "@/components/task/list/list-skeleton";
import { InlineSubTaskForm } from "./inline-subtask-form";
import { SubTaskRow } from "./subtask-row";
import { TaskWithSubTasks } from "@/components/task/shared/types";
import { UserPermissionsType } from "@/data/user/get-user-permissions";

interface SubTaskListProps {
    task: TaskWithSubTasks;
    members: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    canCreateSubTask: boolean;
    columnVisibility: ColumnVisibility;
    isLoading: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    onSubTaskClick?: (subTask: SubTaskType) => void;
    onSubTaskUpdated?: (subTaskId: string, updatedData: Partial<SubTaskType>) => void;
    onSubTaskDeleted?: (subTaskId: string) => void;
    onSubTaskCreated?: (subTask: any, tempId?: string) => void;
    selectedSubTasks?: Set<string>;
    onSelectSubTask?: (subTaskId: string, checked: boolean) => void;
    level?: "workspace" | "project";
    tags?: { id: string; name: string; }[];
    // Permission props
    permissions?: UserPermissionsType; // For project view
    userId?: string;
    isWorkspaceAdmin?: boolean; // For workspace view
    leadProjectIds?: string[]; // For workspace view
    projects?: Array<{ id: string; canManageMembers?: boolean }>; // For workspace view
}

export function SubTaskList({
    task,
    members,
    workspaceId,
    projectId,
    canCreateSubTask,
    columnVisibility,
    isLoading,
    isLoadingMore,
    onLoadMore,
    onSubTaskClick,
    onSubTaskUpdated,
    onSubTaskDeleted,
    onSubTaskCreated,
    selectedSubTasks = new Set(),
    onSelectSubTask,
    level = "project",
    tags = [],
    permissions,
    userId,
    isWorkspaceAdmin,
    leadProjectIds,
    projects,
}: SubTaskListProps) {
    const [showInlineSubTaskForm, setShowInlineSubTaskForm] = useState(false);

    // Calculate total columns: drag + name + visible columns + actions (no checkbox anymore)
    const visibleColumnsCount = 2 + Object.values(columnVisibility).filter(Boolean).length + 1;

    if (isLoading) {
        return (
            <SubTaskSkeleton columnVisibility={columnVisibility} />
        );
    }

    if (!task.subTasks || task.subTasks.length === 0) {
        return (
            <>
                {canCreateSubTask && (
                    showInlineSubTaskForm ? (
                        <InlineSubTaskForm
                            workspaceId={workspaceId}
                            projectId={projectId}
                            parentTaskId={task.id}
                            members={members}
                            tags={tags}
                            columnVisibility={columnVisibility}
                            userId={userId}
                            onCancel={() => setShowInlineSubTaskForm(false)}
                            onSubTaskCreated={(subTask, tempId) => {
                                onSubTaskCreated?.(subTask, tempId);
                                setShowInlineSubTaskForm(false);
                            }}
                            onSubTaskDeleted={onSubTaskDeleted}
                        />
                    ) : (
                        <TableRow className="bg-muted/30 hover:bg-muted/20 cursor-pointer" onClick={() => setShowInlineSubTaskForm(true)}>
                            <TableCell colSpan={visibleColumnsCount} className="p-3 pl-12 text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    <span>Add SubTask</span>
                                </div>
                            </TableCell>
                        </TableRow>
                    )
                )}
            </>
        );
    }

    // Sort subtasks by position for correct display order
    const sortedSubTasks = [...task.subTasks].sort((a, b) => {
        const posA = a.position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.position ?? Number.MAX_SAFE_INTEGER;
        return posA - posB;
    });

    return (
        <>
            <SortableContext
                items={sortedSubTasks.map((sub) => sub.id)}
                strategy={verticalListSortingStrategy}
            >
                {sortedSubTasks.map((subTask) => (
                    <SubTaskRow
                        key={subTask.id}
                        subTask={subTask as any}
                        columnVisibility={columnVisibility}
                        onClick={onSubTaskClick}
                        members={members}
                        projectId={projectId}
                        parentTaskId={task.id}
                        parentTaskProject={task.project}
                        isSelected={selectedSubTasks.has(subTask.id)}
                        onSelectChange={(checked) => onSelectSubTask?.(subTask.id, checked)}
                        onSubTaskUpdated={onSubTaskUpdated}
                        onSubTaskDeleted={onSubTaskDeleted}
                        tags={tags}
                        permissions={permissions}
                        userId={userId}
                        isWorkspaceAdmin={isWorkspaceAdmin}
                        leadProjectIds={leadProjectIds}
                        projects={projects}
                    />
                ))}
            </SortableContext>

            {/* Load More Subtasks Button */}
            {task.subTasksHasMore && (
                <TableRow className="bg-muted/10">
                    <TableCell colSpan={visibleColumnsCount} className="p-2 pl-12">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onLoadMore}
                            disabled={isLoadingMore}
                            className="w-full"
                        >
                            {isLoadingMore ? (
                                <>
                                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    Loading more subtasks...
                                </>
                            ) : (
                                <>
                                    <ChevronsDown className="mr-2 h-3 w-3" />
                                    Load More Subtasks
                                </>
                            )}
                        </Button>
                    </TableCell>
                </TableRow>
            )}

            {/* Add SubTask - Inline Form or Button */}
            {canCreateSubTask && (
                showInlineSubTaskForm ? (
                    <InlineSubTaskForm
                        workspaceId={workspaceId}
                        projectId={projectId}
                        parentTaskId={task.id}
                        members={members}
                        tags={tags}
                        columnVisibility={columnVisibility}
                        userId={userId}
                        onCancel={() => setShowInlineSubTaskForm(false)}
                        onSubTaskCreated={(subTask, tempId) => {
                            onSubTaskCreated?.(subTask, tempId);
                            setShowInlineSubTaskForm(false);
                        }}
                        onSubTaskDeleted={onSubTaskDeleted}
                    />
                ) : (
                    <TableRow className="bg-muted/30 hover:bg-muted/20 cursor-pointer" onClick={() => setShowInlineSubTaskForm(true)}>
                        <TableCell colSpan={visibleColumnsCount} className="p-3 pl-12 text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                <span>Add SubTask</span>
                            </div>
                        </TableCell>
                    </TableRow>
                )
            )}
        </>
    );
}
