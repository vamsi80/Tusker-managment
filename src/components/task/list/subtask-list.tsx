"use client";

import { useState, useRef, useEffect } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TableCell, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { SubTaskType } from "@/data/task";
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

    // Infinite Scroll Implementation for Subtasks - MUST be at top level (Rules of Hooks)
    const bottomRef = useRef<HTMLTableRowElement>(null);

    useEffect(() => {
        if (!task.subTasksHasMore || isLoadingMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    onLoadMore();
                }
            },
            { rootMargin: "100px" }
        );

        const currentRef = bottomRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }

        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            }
        };
    }, [task.subTasksHasMore, isLoadingMore, onLoadMore]);

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
                            <TableCell colSpan={visibleColumnsCount} className="p-3 pl-12 text-primary">
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

            {task.subTasksHasMore && (
                <TableRow ref={bottomRef} className="bg-muted/10 animate-pulse">
                    <TableCell colSpan={visibleColumnsCount} className="py-2 h-10 pl-12">
                        {isLoadingMore && (
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-4 w-full animate-pulse" />
                            </div>
                        )}
                    </TableCell>
                </TableRow>
            )}
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
                        <TableCell colSpan={visibleColumnsCount} className="p-3 pl-12 text-primary">
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
