"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronsDown } from "lucide-react";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import { SubTaskType } from "@/app/data/task/get-project-tasks";
import { CreateSubTaskForm } from "../forms/create-subTask-form";
import { BulkCreateSubTaskForm } from "../forms/bulk-create-subtask-form";
import { SubTaskRow } from "./subtask-row";
import { ColumnVisibility } from "./task-table-toolbar";
import { TaskWithSubTasks } from "./types";
import { SubTaskSkeleton } from "../task-page-skeleton";

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
    onSubTaskClick?: (subTask: SubTaskType[number]) => void;
    onSubTaskUpdated?: (subTaskId: string, updatedData: Partial<SubTaskType[number]>) => void;
    onSubTaskDeleted?: (subTaskId: string) => void;
    onSubTaskCreated?: (subTask: any) => void;
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
}: SubTaskListProps) {
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
                            <BulkCreateSubTaskForm
                                members={members}
                                workspaceId={workspaceId}
                                projectId={projectId}
                                parentTaskId={task.id}
                                onSubTaskCreated={(newSubTasks) => {
                                    // Handle multiple subtasks created
                                    newSubTasks.forEach(st => onSubTaskCreated?.(st));
                                }}
                            />
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

    return (
        <>
            <SortableContext
                items={task.subTasks.map((sub) => sub.id)}
                strategy={verticalListSortingStrategy}
            >
                {task.subTasks.map((subTask) => (
                    <SubTaskRow
                        key={subTask.id}
                        subTask={subTask}
                        columnVisibility={columnVisibility}
                        onClick={onSubTaskClick}
                        members={members}
                        projectId={projectId}
                        parentTaskId={task.id}
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
                            <BulkCreateSubTaskForm
                                members={members}
                                workspaceId={workspaceId}
                                projectId={projectId}
                                parentTaskId={task.id}
                                onSubTaskCreated={(newSubTasks) => {
                                    // Handle multiple subtasks created
                                    newSubTasks.forEach(st => onSubTaskCreated?.(st));
                                }}
                            />
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
