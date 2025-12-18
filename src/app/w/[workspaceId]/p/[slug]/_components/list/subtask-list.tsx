"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronsDown } from "lucide-react";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { FlatTaskType } from "@/data/task";
import { CreateSubTaskForm } from "../forms/create-subTask-form";
// import { BulkCreateSubTaskForm } from "../forms/bulk-create-subtask-form";
import { SubTaskRow } from "./subtask-row";
import { ColumnVisibility } from "./task-table-toolbar";
import { TaskWithSubTasks } from "./types";
import { SubTaskSkeleton } from "../layout/list-skeleton";

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
    onSubTaskClick?: (subTask: FlatTaskType) => void;
    onSubTaskUpdated?: (subTaskId: string, updatedData: Partial<FlatTaskType>) => void;
    onSubTaskDeleted?: (subTaskId: string) => void;
    onSubTaskCreated?: (subTask: any) => void;
    selectedSubTasks?: Set<string>;
    onSelectSubTask?: (subTaskId: string, checked: boolean) => void;
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
}: SubTaskListProps) {
    // Calculate total columns: drag + name + visible columns + actions (no checkbox anymore)
    const visibleColumnsCount = 2 + Object.values(columnVisibility).filter(Boolean).length + 1;

    if (isLoading) {
        return (
            <SubTaskSkeleton columnVisibility={columnVisibility} />
        );
    }

    if (!task.subTasks || task.subTasks.length === 0) {
        return (
            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={visibleColumnsCount} className="p-2 pl-12">
                    {canCreateSubTask && (
                        <div className="flex gap-2">
                            <CreateSubTaskForm
                                members={members}
                                workspaceId={workspaceId}
                                projectId={projectId}
                                parentTaskId={task.id}
                                onSubTaskCreated={onSubTaskCreated}
                            />
                        </div>
                    )}
                </TableCell>
            </TableRow>
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
                        subTask={subTask}
                        columnVisibility={columnVisibility}
                        onClick={onSubTaskClick}
                        members={members}
                        projectId={projectId}
                        parentTaskId={task.id}
                        isSelected={selectedSubTasks.has(subTask.id)}
                        onSelectChange={(checked) => onSelectSubTask?.(subTask.id, checked)}
                        onSubTaskUpdated={onSubTaskUpdated}
                        onSubTaskDeleted={onSubTaskDeleted}
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

            <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={visibleColumnsCount} className="p-2 pl-12">
                    {canCreateSubTask && (
                        <div className="flex gap-2">
                            <CreateSubTaskForm
                                members={members}
                                workspaceId={workspaceId}
                                projectId={projectId}
                                parentTaskId={task.id}
                                onSubTaskCreated={onSubTaskCreated}
                            />
                        </div>
                    )}
                </TableCell>
            </TableRow>
        </>
    );
}
