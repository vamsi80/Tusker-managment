"use client";

import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubTasksByStatusResponse } from "@/data/task/kanban";
import { SubTaskType } from "@/data/task";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import { KanbanToolbar } from "./kanban-toolbar";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { createReviewCommentAction } from "@/actions/comment";
import { toast } from "sonner";
import { updateSubTaskStatus } from "@/actions/task/kanban/update-subtask-status";
import { ReviewCommentDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/review-comment-form";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/colors/status-colors";
import { Loader2 } from "lucide-react";
import { loadMoreSubtasksAction } from "@/actions/task/kanban/load-more-subtasks";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

interface KanbanBoardPaginatedProps {
    initialData: Record<TaskStatus, SubTasksByStatusResponse>;
    projectMembers: ProjectMembersType;
    workspaceId: string;
    projectId: string;
}

const COLUMNS: { id: TaskStatus; title: string; color: string; bgColor: string; borderColor: string }[] = [
    {
        id: "TO_DO",
        title: STATUS_LABELS.TO_DO,
        ...STATUS_COLORS.TO_DO,
    },
    {
        id: "IN_PROGRESS",
        title: STATUS_LABELS.IN_PROGRESS,
        ...STATUS_COLORS.IN_PROGRESS,
    },
    {
        id: "BLOCKED",
        title: STATUS_LABELS.BLOCKED,
        ...STATUS_COLORS.BLOCKED,
    },
    {
        id: "REVIEW",
        title: STATUS_LABELS.REVIEW,
        ...STATUS_COLORS.REVIEW,
    },
    {
        id: "HOLD",
        title: STATUS_LABELS.HOLD,
        ...STATUS_COLORS.HOLD,
    },
    {
        id: "COMPLETED",
        title: STATUS_LABELS.COMPLETED,
        ...STATUS_COLORS.COMPLETED,
    },
];

function DroppableColumn({
    column,
    subTasks,
    totalCount,
    hasMore,
    isLoadingMore,
    onSubTaskClick,
    onLoadMore,
}: {
    column: typeof COLUMNS[number];
    subTasks: SubTaskType[];
    totalCount: number;
    hasMore: boolean;
    isLoadingMore: boolean;
    onSubTaskClick: (subTask: SubTaskType) => void;
    onLoadMore: () => void;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: column.id,
    });

    return (
        <div className="flex-shrink-0 w-80 flex flex-col h-full">
            {/* Column Header */}
            <div
                className={cn(
                    "border-2 border-b p-4",
                    column.borderColor,
                    column.bgColor
                )}
            >
                <div className="flex items-center justify-between">
                    <h3 className={cn("font-semibold text-sm", column.color)}>
                        {column.title}
                    </h3>
                    <Badge
                        variant="secondary"
                        className={cn("text-xs", column.color)}
                    >
                        {subTasks.length} / {totalCount}
                    </Badge>
                </div>
            </div>

            {/* Column Content with individual scroll */}
            <div
                ref={setNodeRef}
                className={cn(
                    "flex-1 p-3 transition-all overflow-y-auto",
                    isOver ? "border-4" : "border-2 border-t-0",
                    column.borderColor,
                    // Custom ultra-thin scrollbar
                    "[&::-webkit-scrollbar]:w-0.5",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-slate-300",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                )}
            >
                <SortableContext
                    items={subTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-3 min-h-[100px]">
                        {subTasks.map((subTask) => (
                            <KanbanCard
                                key={subTask.id}
                                subTask={subTask}
                                columnColor={column.color}
                                onSubTaskClick={onSubTaskClick}
                            />
                        ))}

                        {/* Load More Button */}
                        {hasMore && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={onLoadMore}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    `Load More (${totalCount - subTasks.length} remaining)`
                                )}
                            </Button>
                        )}

                        {subTasks.length === 0 && (
                            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                                No subtasks
                            </div>
                        )}
                    </div>
                </SortableContext>
            </div>
        </div>
    );
}

export function KanbanBoardPaginated({
    initialData,
    projectMembers,
    workspaceId,
    projectId
}: KanbanBoardPaginatedProps) {
    // State for each column's data
    const [columnData, setColumnData] = useState<Record<TaskStatus, {
        subTasks: SubTaskType[];
        totalCount: number;
        hasMore: boolean;
        currentPage: number;
    }>>(
        Object.fromEntries(
            COLUMNS.map(col => [
                col.id,
                {
                    subTasks: initialData[col.id].subTasks,
                    totalCount: initialData[col.id].totalCount,
                    hasMore: initialData[col.id].hasMore,
                    currentPage: 1,
                }
            ])
        ) as Record<TaskStatus, any>
    );

    const [loadingColumns, setLoadingColumns] = useState<Record<TaskStatus, boolean>>(
        Object.fromEntries(COLUMNS.map(col => [col.id, false])) as Record<TaskStatus, boolean>
    );

    const [activeSubTask, setActiveSubTask] = useState<SubTaskType | null>(null);

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    // Review comment dialog state
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [pendingReviewMove, setPendingReviewMove] = useState<{
        subTaskId: string;
        previousStatus: TaskStatus;
    } | null>(null);

    // Filter states
    const [selectedParentTask, setSelectedParentTask] = useState<string | null>(null);
    const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
    const [visibleColumns, setVisibleColumns] = useState<Record<TaskStatus, boolean>>({
        TO_DO: true,
        IN_PROGRESS: true,
        BLOCKED: false,
        REVIEW: true,
        HOLD: false,
        COMPLETED: false,
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    // Load more function for a specific column
    const handleLoadMore = async (status: TaskStatus) => {
        setLoadingColumns(prev => ({ ...prev, [status]: true }));

        try {
            const nextPage = columnData[status].currentPage + 1;

            // ✅ Call server action (same data function as initial load)
            // This uses React cache + Next.js unstable_cache
            const response = await loadMoreSubtasksAction(
                projectId,
                workspaceId,
                status,
                nextPage,
                5
            );

            if (!response.success) {
                toast.error(response.error || "Failed to load more subtasks");
                return;
            }

            setColumnData(prev => ({
                ...prev,
                [status]: {
                    subTasks: [...prev[status].subTasks, ...response.data.subTasks],
                    totalCount: response.data.totalCount,
                    hasMore: response.data.hasMore,
                    currentPage: nextPage,
                }
            }));
        } catch (error) {
            console.error(`Error loading more subtasks for ${status}:`, error);
            toast.error("Failed to load more subtasks");
        } finally {
            setLoadingColumns(prev => ({ ...prev, [status]: false }));
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        // Find the subtask across all columns
        for (const status of COLUMNS.map(c => c.id)) {
            const subTask = columnData[status].subTasks.find((t) => t.id === active.id);
            if (subTask) {
                setActiveSubTask(subTask);
                break;
            }
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveSubTask(null);

        if (!over) {
            return;
        }

        const subTaskId = active.id as string;
        const newStatus = over.id as TaskStatus;

        const validStatuses: TaskStatus[] = ["TO_DO", "IN_PROGRESS", "BLOCKED", "REVIEW", "HOLD", "COMPLETED"];
        if (!validStatuses.includes(newStatus)) {
            return;
        }

        // Find the subtask and its current status
        let currentStatus: TaskStatus | null = null;
        let subTask: SubTaskType | null = null;

        for (const status of COLUMNS.map(c => c.id)) {
            const found = columnData[status].subTasks.find((t) => t.id === subTaskId);
            if (found) {
                currentStatus = status;
                subTask = found;
                break;
            }
        }

        if (!subTask || !currentStatus || currentStatus === newStatus) {
            return;
        }

        const previousStatus = currentStatus;

        if (newStatus === "REVIEW") {
            // Move task optimistically
            moveSubTaskBetweenColumns(subTaskId, previousStatus, newStatus);

            setPendingReviewMove({
                subTaskId,
                previousStatus,
            });
            setIsReviewDialogOpen(true);
            return;
        }

        await performStatusUpdate(subTaskId, newStatus, previousStatus);
    };

    const moveSubTaskBetweenColumns = (
        subTaskId: string,
        fromStatus: TaskStatus,
        toStatus: TaskStatus
    ) => {
        setColumnData(prev => {
            const fromTasks = prev[fromStatus].subTasks;
            const task = fromTasks.find(t => t.id === subTaskId);

            if (!task) return prev;

            const updatedTask = { ...task, status: toStatus };

            return {
                ...prev,
                [fromStatus]: {
                    ...prev[fromStatus],
                    subTasks: fromTasks.filter(t => t.id !== subTaskId),
                    totalCount: prev[fromStatus].totalCount - 1,
                },
                [toStatus]: {
                    ...prev[toStatus],
                    subTasks: [updatedTask, ...prev[toStatus].subTasks],
                    totalCount: prev[toStatus].totalCount + 1,
                }
            };
        });
    };

    const performStatusUpdate = async (
        subTaskId: string,
        newStatus: TaskStatus,
        previousStatus: TaskStatus,
        reviewCommentId?: string
    ) => {
        // Optimistic update
        moveSubTaskBetweenColumns(subTaskId, previousStatus, newStatus);

        const toastId = toast.loading("Updating subtask status...");

        try {
            const result = await updateSubTaskStatus(
                subTaskId,
                newStatus,
                workspaceId,
                projectId,
                undefined,
                reviewCommentId
            );

            if (result.success) {
                toast.success("Subtask status updated successfully", {
                    id: toastId,
                });
            } else {
                // Rollback
                moveSubTaskBetweenColumns(subTaskId, newStatus, previousStatus);

                toast.error(result.error || "Failed to update subtask status", {
                    id: toastId,
                });
            }
        } catch (error) {
            // Rollback
            moveSubTaskBetweenColumns(subTaskId, newStatus, previousStatus);

            toast.error("An unexpected error occurred. Please try again.", {
                id: toastId,
            });
            console.error("Error updating subtask status:", error);
        }
    };

    const handleDragCancel = () => {
        setActiveSubTask(null);
    };

    const handleSubTaskClick = (subTask: SubTaskType) => {
        openSubTaskSheet(subTask);
    };

    const handleReviewCommentSubmit = async (comment: string, attachment?: File) => {
        if (!pendingReviewMove) return;

        try {
            let attachmentData: {
                fileName: string;
                fileType: string;
                fileSize: number;
                base64Data: string;
            } | undefined;

            if (attachment) {
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result as string;
                        const base64Data = result.split(',')[1];
                        resolve(base64Data);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(attachment);
                });

                attachmentData = {
                    fileName: attachment.name,
                    fileType: attachment.type,
                    fileSize: attachment.size,
                    base64Data: base64,
                };
            }

            const reviewResult = await createReviewCommentAction(
                pendingReviewMove.subTaskId,
                comment,
                workspaceId,
                projectId,
                attachmentData
            );

            if (!reviewResult.success) {
                // Rollback
                moveSubTaskBetweenColumns(
                    pendingReviewMove.subTaskId,
                    "REVIEW",
                    pendingReviewMove.previousStatus
                );
                toast.error(reviewResult.error || "Failed to create review comment");
                setPendingReviewMove(null);
                return;
            }

            await performStatusUpdate(
                pendingReviewMove.subTaskId,
                "REVIEW",
                pendingReviewMove.previousStatus,
                reviewResult.reviewCommentId
            );

            setPendingReviewMove(null);
        } catch (error) {
            console.error("Error submitting review comment:", error);
            if (pendingReviewMove) {
                moveSubTaskBetweenColumns(
                    pendingReviewMove.subTaskId,
                    "REVIEW",
                    pendingReviewMove.previousStatus
                );
            }
            toast.error("Failed to submit review comment");
            setPendingReviewMove(null);
        }
    };

    const handleReviewCommentCancel = () => {
        if (pendingReviewMove) {
            moveSubTaskBetweenColumns(
                pendingReviewMove.subTaskId,
                "REVIEW",
                pendingReviewMove.previousStatus
            );
            setPendingReviewMove(null);
        }
        setIsReviewDialogOpen(false);
    };

    // Get filtered subtasks for a specific column
    const getFilteredSubTasks = (status: TaskStatus) => {
        return columnData[status].subTasks.filter((subTask) => {
            const matchesParentTask = !selectedParentTask || subTask.parentTaskId === selectedParentTask;
            const matchesAssignee = !selectedAssignee || subTask.assignee?.id === selectedAssignee;
            return matchesParentTask && matchesAssignee;
        });
    };

    // Get unique parent tasks for filter
    const uniqueParentTasks = Array.from(
        new Map(
            COLUMNS.flatMap(col =>
                columnData[col.id].subTasks
                    .filter((st) => st.parentTask)
                    .map((st) => [st.parentTask!.id, st.parentTask!])
            )
        ).values()
    );

    return (
        <>
            <KanbanToolbar
                parentTasks={uniqueParentTasks}
                projectMembers={projectMembers}
                selectedParentTask={selectedParentTask}
                selectedAssignee={selectedAssignee}
                visibleColumns={visibleColumns}
                onParentTaskChange={setSelectedParentTask}
                onAssigneeChange={setSelectedAssignee}
                onVisibleColumnsChange={setVisibleColumns}
            />

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <div className={cn(
                    "flex gap-4 h-[calc(100vh-280px)] overflow-x-auto pb-2",
                    // Custom horizontal scrollbar
                    "[&::-webkit-scrollbar]:h-2",
                    "[&::-webkit-scrollbar-track]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:bg-accent",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb]:hover:bg-accent/50"
                )}>
                    {COLUMNS.filter((col) => visibleColumns[col.id]).map((column) => {
                        const filteredSubTasks = getFilteredSubTasks(column.id);
                        return (
                            <DroppableColumn
                                key={column.id}
                                column={column}
                                subTasks={filteredSubTasks}
                                totalCount={columnData[column.id].totalCount}
                                hasMore={columnData[column.id].hasMore}
                                isLoadingMore={loadingColumns[column.id]}
                                onSubTaskClick={handleSubTaskClick}
                                onLoadMore={() => handleLoadMore(column.id)}
                            />
                        );
                    })}
                </div>

                {/* Drag Overlay */}
                <DragOverlay>
                    {activeSubTask ? (
                        <div className="rotate-3 opacity-80">
                            <KanbanCard subTask={activeSubTask} columnColor="text-slate-700" isDragging />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {/* Review Comment Dialog */}
            <ReviewCommentDialog
                isOpen={isReviewDialogOpen}
                onClose={handleReviewCommentCancel}
                onSubmit={handleReviewCommentSubmit}
                subTaskName={
                    pendingReviewMove
                        ? COLUMNS.flatMap(col => columnData[col.id].subTasks)
                            .find((st) => st.id === pendingReviewMove.subTaskId)?.name || "Subtask"
                        : "Subtask"
                }
            />
        </>
    );
}
