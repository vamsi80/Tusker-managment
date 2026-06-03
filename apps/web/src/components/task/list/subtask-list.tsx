"use client";

import { useState, useRef, useEffect } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectMembersType } from "@/types/project";
import type { SubTaskType } from "@/types/task";
import { ColumnVisibility } from "../shared/column-visibility";
import { SubTaskSkeleton } from "@/components/task/list/list-skeleton";
import { InlineSubTaskForm } from "./inline-subtask-form";
import { SubTaskRow } from "./subtask-row";
import type { TaskWithSubTasks } from "@/components/task/shared/types";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

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
    onSubTasksReordered?: (parentId: string, newSubTasks: any[]) => void;
    selectedSubTasks?: Set<string>;
    onSelectSubTask?: (subTaskId: string, checked: boolean) => void;
    level?: "workspace" | "project";
    tags?: { id: string; name: string; }[];
    permissions?: UserPermissionsType;
    userId?: string;
    isWorkspaceAdmin?: boolean;
    leadProjectIds?: string[];
    coordinatorProjectIds?: string[];
    projects?: Array<{ id: string; canManageMembers?: boolean; memberIds?: string[] }>; // For workspace view
    projectMap?: Record<string, any>;
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
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
    onSubTasksReordered,
    selectedSubTasks = new Set(),
    onSelectSubTask,
    level = "project",
    tags = [],
    permissions,
    userId,
    isWorkspaceAdmin,
    leadProjectIds,
    coordinatorProjectIds,
    projects,
    projectMap,
    scrollContainerRef,
}: SubTaskListProps) {
    const [showInlineSubTaskForm, setShowInlineSubTaskForm] = useState(false);
    const bottomRef = useRef<HTMLTableRowElement>(null);
    const [container, setContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setContainer(document.body);
    }, []);

    const [items, setItems] = useState<SubTaskType[]>(task.subTasks || []);

    useEffect(() => {
        setItems(task.subTasks || []);
    }, [task.subTasks]);

    const hasSettledRef = useRef(false);

    useEffect(() => {
        hasSettledRef.current = false;
        const timer = setTimeout(() => {
            hasSettledRef.current = true;
        }, 500);
        return () => clearTimeout(timer);
    }, [task.id]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);

            const newItems = arrayMove(items, oldIndex, newIndex);
            setItems(newItems);

            // Notify parent about the new subtask order so it is saved in the state
            onSubTasksReordered?.(task.id, newItems);

            const toastId = toast.loading("Updating subtask positions...");
            // Call Hono API via apiClient
            try {
                const result = await apiClient.tasks.reorderTasks(
                    workspaceId,
                    projectId,
                    newItems.map(item => item.id)
                );
                if (result.status === "error") {
                    toast.error(result.message || "Failed to reorder tasks", { id: toastId });
                    setItems(task.subTasks || []); // Rollback
                    onSubTasksReordered?.(task.id, task.subTasks || []);
                } else {
                    toast.success("Tasks reordered successfully", { id: toastId });
                }
            } catch (error) {
                toast.error("Failed to reorder tasks", { id: toastId });
                setItems(task.subTasks || []); // Rollback
                onSubTasksReordered?.(task.id, task.subTasks || []);
            }
        }
    };

    useEffect(() => {
        if (!task.subTasksHasMore || isLoadingMore || !scrollContainerRef?.current) return;

        const container = scrollContainerRef.current;

        const handleScroll = () => {
            if (!hasSettledRef.current || isLoadingMore) return;

            const sentinel = bottomRef.current;
            if (!sentinel) return;

            const containerRect = container.getBoundingClientRect();
            const sentinelRect = sentinel.getBoundingClientRect();

            // Fire only when the sentinel is near the container's bottom edge (within 80px)
            const distanceFromContainerBottom = sentinelRect.bottom - containerRect.bottom;

            if (distanceFromContainerBottom <= 80) {
                onLoadMore();
            }
        };

        container.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            container.removeEventListener("scroll", handleScroll);
        };
    }, [task.subTasksHasMore, isLoadingMore, onLoadMore, scrollContainerRef]);

    const visiblePropsCount = Object.entries(columnVisibility)
        .filter(([key, visible]) => key !== 'project' && visible)
        .length;
    const visibleColumnsCount = 2 + visiblePropsCount + 1;

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
                                    <Plus className="size-4" />
                                    <span>Add SubTask</span>
                                </div>
                            </TableCell>
                        </TableRow>
                    )
                )}
            </>
        );
    }

    return (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                accessibility={{
                    container: container || undefined,
                }}
            >
                <SortableContext
                    items={items.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {items.map((subTask) => (
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
                            onSelectChange={(checked: boolean) => onSelectSubTask?.(subTask.id, checked)}
                            onSubTaskUpdated={onSubTaskUpdated}
                            onSubTaskDeleted={onSubTaskDeleted}
                            tags={tags}
                            permissions={permissions}
                            userId={userId}
                            isWorkspaceAdmin={isWorkspaceAdmin}
                            leadProjectIds={leadProjectIds}
                            coordinatorProjectIds={coordinatorProjectIds}
                            projects={projects}
                            projectMap={projectMap}
                        />
                    ))}
                </SortableContext>
            </DndContext>

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
                                <Plus className="size-4" />
                                <span>Add SubTask</span>
                            </div>
                        </TableCell>
                    </TableRow>
                )
            )}
        </>
    );
}

