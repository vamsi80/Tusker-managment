"use client";

import { useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SubTasksByStatusResponse } from "@/data/task/kanban";
import { SubTaskType } from "@/data/task";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { cn } from "@/lib/utils";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { createReviewCommentAction } from "@/actions/comment";
import { toast } from "sonner";
import { updateSubTaskStatus } from "@/actions/task/kanban/update-subtask-status";
import { ReviewCommentDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/review-comment-form";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/colors/status-colors";
import { loadMoreSubtasksAction } from "@/actions/task/kanban/load-more-subtasks";
import { KanbanCard } from "./kanban-card";
import { useReloadView } from "@/hooks/use-reload-view";
import { KanbanColumn } from "./kanban-column";
import { GlobalFilterToolbar, ParentTaskOption } from "../shared/global-filter-toolbar";
import { TaskFilters, type ProjectOption } from "../shared/types";
import { KanbanColumnVisibility as KanbanColumnVisibilityType } from "../shared/kanban-column-visibility";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

interface KanbanBoardProps {
    initialData: Record<TaskStatus, SubTasksByStatusResponse>;
    projectMembers: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    projects?: ProjectOption[]; // Optional for workspace-level
    level?: "project" | "workspace"; // Optional, defaults to "project"
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

export function KanbanBoard({
    initialData,
    projectMembers,
    workspaceId,
    projectId,
    projects,
    level = "project"
}: KanbanBoardProps) {
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
    const reloadView = useReloadView();

    // Review comment dialog state
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [pendingReviewMove, setPendingReviewMove] = useState<{
        subTaskId: string;
        previousStatus: TaskStatus;
    } | null>(null);

    // Filter states - using TaskFilters interface
    const [filters, setFilters] = useState<TaskFilters>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [visibleColumns, setVisibleColumns] = useState<KanbanColumnVisibilityType>({
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
                workspaceId,
                status,
                projectId,
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

                // Reload all views to reflect the status change
                reloadView();
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
            const matchesParentTask = !filters.parentTaskId || subTask.parentTaskId === filters.parentTaskId;
            const matchesAssignee = !filters.assigneeId || subTask.assignee?.id === filters.assigneeId;

            // Date range filtering
            let matchesDateRange = true;
            if (filters.startDate || filters.endDate) {
                const subTaskStartDate = subTask.startDate ? new Date(subTask.startDate) : null;

                // Calculate due date (start date + days)
                let subTaskDueDate: Date | null = null;
                if (subTaskStartDate && subTask.days) {
                    subTaskDueDate = new Date(subTaskStartDate);
                    subTaskDueDate.setDate(subTaskDueDate.getDate() + subTask.days);
                }

                // Check if start date is within range
                if (filters.startDate && subTaskStartDate) {
                    const filterStartDate = new Date(filters.startDate);
                    if (subTaskStartDate < filterStartDate) {
                        matchesDateRange = false;
                    }
                }

                // Check if due date is within range
                if (filters.endDate && subTaskDueDate) {
                    const filterEndDate = new Date(filters.endDate);
                    if (subTaskDueDate > filterEndDate) {
                        matchesDateRange = false;
                    }
                }

                // If no valid dates on subtask, exclude it when date filter is active
                if ((filters.startDate || filters.endDate) && !subTaskStartDate) {
                    matchesDateRange = false;
                }
            }

            return matchesParentTask && matchesAssignee && matchesDateRange;
        });
    };

    // Get unique parent tasks for filter - convert to ParentTaskOption format
    const uniqueParentTasks: ParentTaskOption[] = Array.from(
        new Map(
            COLUMNS.flatMap(col =>
                columnData[col.id].subTasks
                    .filter((st) => st.parentTask)
                    .map((st) => [st.parentTask!.id, {
                        id: st.parentTask!.id,
                        name: st.parentTask!.name,
                        taskSlug: st.parentTask!.taskSlug
                    }])
            )
        ).values()
    );

    // Convert project members to MemberOption format
    const memberOptions = projectMembers.map(member => ({
        id: member.id,
        name: member.workspaceMember.user.name,
        surname: member.workspaceMember.user.surname || undefined,
    }));

    return (
        <>
            <GlobalFilterToolbar
                level={level}
                view="kanban"
                filters={filters}
                searchQuery={searchQuery}
                members={memberOptions}
                projects={projects}
                parentTasks={uniqueParentTasks}
                kanbanColumnVisibility={visibleColumns}
                setKanbanColumnVisibility={setVisibleColumns}
                onFilterChange={setFilters}
                onSearchChange={setSearchQuery}
                onClearAll={() => {
                    setFilters({});
                    setSearchQuery("");
                }}
            />

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <div className={cn(
                    "flex gap-4 h-[calc(100vh-280px)] overflow-x-auto pb-2 mt-4",
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
                            <KanbanColumn
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
