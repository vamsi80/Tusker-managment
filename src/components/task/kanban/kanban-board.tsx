"use client";

import { useState, useEffect } from "react";
import { SubTasksByStatusResponse, KanbanSubTaskType } from "@/data/task/kanban";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { cn } from "@/lib/utils";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { createReviewCommentAction } from "@/actions/comment";
import { toast } from "sonner";
import { KanbanCard } from "./kanban-card";
import { KanbanColumn } from "./kanban-column";
import { useReloadView } from "@/hooks/use-reload-view";
import { TaskFilters, type ProjectOption } from "../shared/types";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/colors/status-colors";
import { updateSubTaskStatus } from "@/actions/task/kanban/update-subtask-status";
import { loadMoreSubtasksAction } from "@/actions/task/kanban/load-more-subtasks";
import { GlobalFilterToolbar, ParentTaskOption } from "../shared/global-filter-toolbar";
import { KanbanColumnVisibility as KanbanColumnVisibilityType } from "../shared/kanban-column-visibility";
import { ReviewCommentDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/review-comment-form";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";

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
        id: "REVIEW",
        title: STATUS_LABELS.REVIEW,
        ...STATUS_COLORS.REVIEW,
    },
    {
        id: "COMPLETED",
        title: STATUS_LABELS.COMPLETED,
        ...STATUS_COLORS.COMPLETED,
    },
    {
        id: "HOLD",
        title: STATUS_LABELS.HOLD,
        ...STATUS_COLORS.HOLD,
    },
    {
        id: "CANCELLED",
        title: STATUS_LABELS.CANCELLED,
        ...STATUS_COLORS.CANCELLED,
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
        subTasks: KanbanSubTaskType[];
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

    const [activeSubTask, setActiveSubTask] = useState<KanbanSubTaskType | null>(null);

    const { openSubTaskSheet } = useSubTaskSheet();
    const reloadView = useReloadView();

    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [pendingReviewMove, setPendingReviewMove] = useState<{
        subTaskId: string;
        previousStatus: TaskStatus;
    } | null>(null);

    const [filters, setFilters] = useState<TaskFilters>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [visibleColumns, setVisibleColumns] = useState<KanbanColumnVisibilityType>({
        TO_DO: true,
        IN_PROGRESS: true,
        CANCELLED: true,
        REVIEW: true,
        HOLD: true,
        COMPLETED: true,
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    // Server-side filtering effect
    useEffect(() => {
        const timer = setTimeout(async () => {
            const hasFilters = searchQuery || Object.keys(filters).length > 0;

            if (!hasFilters) {
                // Reset to initial unfiltered data (Page 1 Global)
                setColumnData(Object.fromEntries(COLUMNS.map(col => [col.id, {
                    subTasks: initialData[col.id].subTasks,
                    totalCount: initialData[col.id].totalCount,
                    hasMore: initialData[col.id].hasMore,
                    currentPage: 1,
                }])) as Record<TaskStatus, any>);
                return;
            }

            // Set loading state
            setLoadingColumns(Object.fromEntries(COLUMNS.map(col => [col.id, true])) as Record<TaskStatus, boolean>);

            try {
                // Fetch filtered Page 1 for all columns
                const promises = COLUMNS.map(async (col) => {
                    const targetProjectId = filters.projectId || projectId;
                    const res = await loadMoreSubtasksAction(workspaceId, col.id, targetProjectId, 1, 5, {
                        ...filters,
                        startDate: filters.startDate ? new Date(filters.startDate).toISOString() : undefined,
                        endDate: filters.endDate ? new Date(filters.endDate).toISOString() : undefined,
                        searchQuery
                    });
                    return { id: col.id, res };
                });

                const results = await Promise.all(promises);

                setColumnData(prev => {
                    const newData = { ...prev };
                    results.forEach(({ id, res }) => {
                        if (res.success) {
                            newData[id] = {
                                subTasks: res.data.subTasks,
                                totalCount: res.data.totalCount,
                                hasMore: res.data.hasMore,
                                currentPage: 1
                            };
                        }
                    });
                    return newData;
                });
            } catch (err) {
                console.error("Error filtering subtasks", err);
                toast.error("Failed to apply filters");
            } finally {
                setLoadingColumns(Object.fromEntries(COLUMNS.map(col => [col.id, false])) as Record<TaskStatus, boolean>);
            }

        }, 300); // Debounce

        return () => clearTimeout(timer);
    }, [filters, searchQuery, workspaceId, projectId]);

    const handleLoadMore = async (status: TaskStatus) => {
        setLoadingColumns(prev => ({ ...prev, [status]: true }));

        try {
            const nextPage = columnData[status].currentPage + 1;
            const activeFilters = (searchQuery || Object.keys(filters).length > 0)
                ? {
                    ...filters,
                    startDate: filters.startDate ? new Date(filters.startDate).toISOString() : undefined,
                    endDate: filters.endDate ? new Date(filters.endDate).toISOString() : undefined,
                    searchQuery
                }
                : undefined;

            const targetProjectId = filters.projectId || projectId;

            const response = await loadMoreSubtasksAction(
                workspaceId,
                status,
                targetProjectId,
                nextPage,
                5,
                activeFilters
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

        const validStatuses: TaskStatus[] = ["TO_DO", "IN_PROGRESS", "CANCELLED", "REVIEW", "HOLD", "COMPLETED"];
        if (!validStatuses.includes(newStatus)) {
            return;
        }

        let currentStatus: TaskStatus | null = null;
        let subTask: KanbanSubTaskType | null = null;

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

    const getTaskProjectId = (subTaskId: string) => {
        for (const status of COLUMNS.map(c => c.id)) {
            const task = columnData[status].subTasks.find(t => t.id === subTaskId);
            if (task && 'projectId' in task) {
                return (task as any).projectId as string;
            }
        }
        return projectId;
    };

    const performStatusUpdate = async (
        subTaskId: string,
        newStatus: TaskStatus,
        previousStatus: TaskStatus,
        reviewCommentId?: string
    ) => {
        moveSubTaskBetweenColumns(subTaskId, previousStatus, newStatus);

        const toastId = toast.loading("Updating subtask status...");

        try {
            const targetProjectId = getTaskProjectId(subTaskId) || projectId;

            const result = await updateSubTaskStatus(
                subTaskId,
                newStatus,
                workspaceId,
                targetProjectId,
                undefined,
                reviewCommentId
            );

            if (result.success) {
                toast.success("Subtask status updated successfully", {
                    id: toastId,
                });

                reloadView();
            } else {
                moveSubTaskBetweenColumns(subTaskId, newStatus, previousStatus);

                toast.error(result.error || "Failed to update subtask status", {
                    id: toastId,
                });
            }
        } catch (error) {
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

    const handleSubTaskClick = (subTask: KanbanSubTaskType) => {
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

            const targetProjectId = getTaskProjectId(pendingReviewMove.subTaskId) || projectId;

            const reviewResult = await createReviewCommentAction(
                pendingReviewMove.subTaskId,
                comment,
                workspaceId,
                targetProjectId,
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

    const getFilteredSubTasks = (status: TaskStatus) => {
        return columnData[status].subTasks;
    };

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

    const memberOptions = projectMembers.map(member => ({
        id: member.workspaceMember.user.id,
        name: member.workspaceMember.user.name,
        surname: member.workspaceMember.user.surname || undefined,
    }));

    // Bi-directional filtering logic
    const filteredProjects = projects?.filter(p =>
        !filters.assigneeId || (p.memberIds && p.memberIds.includes(filters.assigneeId))
    );

    const filteredMembers = memberOptions.filter(m => {
        if (!filters.projectId) return true;
        const project = projects?.find(p => p.id === filters.projectId);
        return project?.memberIds?.includes(m.id);
    });

    return (
        <>
            <GlobalFilterToolbar
                level={level}
                view="kanban"
                filters={filters}
                searchQuery={searchQuery}
                members={filteredMembers}
                projects={filteredProjects}
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
                    "flex gap-4 h-[calc(100vh-280px)] overflow-x-auto pb-2 mt-0",
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
