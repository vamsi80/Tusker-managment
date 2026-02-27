"use client";

import { useState, useEffect } from "react";
import { SubTasksByStatusResponse, KanbanSubTaskType } from "@/data/task";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { cn } from "@/lib/utils";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { createReviewCommentAction } from "@/actions/comment";
import { toast } from "sonner";
import { KanbanCard } from "./kanban-card";
import { KanbanColumn } from "./kanban-column";
import { useReloadView } from "@/hooks/use-reload-view";
import { TaskFilters, type ProjectOption, type TagOption } from "../shared/types";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/colors/status-colors";
import { updateSubTaskStatus } from "@/actions/task/kanban/update-subtask-status";
import { loadTasksAction } from "@/actions/task/list-actions";
import { GlobalFilterToolbar, ParentTaskOption } from "../shared/global-filter-toolbar";
import { KanbanColumnVisibility as KanbanColumnVisibilityType } from "../shared/kanban-column-visibility";
import { ReviewCommentDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/review-comment-form";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, pointerWithin, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { Loader2 } from "lucide-react";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";

interface KanbanBoardProps {
    initialData: Record<TaskStatus, SubTasksByStatusResponse>;
    projectMembers: ProjectMembersType;
    workspaceId: string;
    projectId: string;
    projects?: ProjectOption[]; // Optional for workspace-level
    tags?: TagOption[];
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
        id: "HOLD",
        title: STATUS_LABELS.HOLD,
        ...STATUS_COLORS.HOLD,
    },
    {
        id: "COMPLETED",
        title: STATUS_LABELS.COMPLETED,
        ...STATUS_COLORS.COMPLETED,
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
    tags,
    level = "project"
}: KanbanBoardProps) {
    const setKanbanTasksCache = useTaskCacheStore(state => state.setKanbanTasksCache);

    // Sync initial data to cache on mount to populate the unified entity store
    useEffect(() => {
        COLUMNS.forEach(col => {
            const contextId = projectId || "";
            const cacheKey = `${workspaceId}-${contextId}-${col.id}`;
            const cached = useTaskCacheStore.getState().getKanbanTasksCache(cacheKey);

            if (!cached && initialData[col.id]) {
                setKanbanTasksCache(cacheKey, {
                    tasks: initialData[col.id].subTasks,
                    hasMore: initialData[col.id].hasMore,
                    page: 1,
                    totalCount: initialData[col.id].totalCount
                });
            }
        });
    }, [initialData, projectId, workspaceId, setKanbanTasksCache]);

    // State for each column's data
    const [columnData, setColumnData] = useState<Record<TaskStatus, {
        subTasks: KanbanSubTaskType[];
        totalCount: number;
        hasMore: boolean;
        nextCursor: any;
    }>>(() => {
        const map: any = {};
        const contextId = projectId || "";

        COLUMNS.forEach(col => {
            const cacheKey = `${workspaceId}-${contextId}-${col.id}`;
            const cached = useTaskCacheStore.getState().getKanbanTasksCache(cacheKey);

            // 1. Base Data: From Cache (if exists) or Server Initial
            let tasks = cached && cached.tasks.length > 0 ? cached.tasks : initialData[col.id].subTasks;
            let totalCount = cached ? (cached.totalCount ?? 0) : initialData[col.id].totalCount;
            let hasMore = cached ? cached.hasMore : initialData[col.id].hasMore;
            let page = cached ? cached.page : 1;

            // 2. Workspace Aggregation: Merge cached tasks from ALL projects
            if (level === 'workspace' && projects) {
                const projectTasks = projects.flatMap(p => {
                    const pKey = `${workspaceId}-${p.id}-${col.id}`;
                    const pCached = useTaskCacheStore.getState().getKanbanTasksCache(pKey);
                    return pCached && pCached.tasks ? pCached.tasks : [];
                });

                if (projectTasks.length > 0) {
                    const taskMap = new Map();
                    // First add current tasks
                    tasks.forEach((t: any) => taskMap.set(t.id, t));
                    // Then add project tasks (will overwrite duplicates, but ensuring uniqueness)
                    projectTasks.forEach((t: any) => taskMap.set(t.id, t));
                    tasks = Array.from(taskMap.values());
                }
            }

            map[col.id] = {
                subTasks: tasks,
                totalCount: totalCount,
                hasMore: hasMore,
                nextCursor: cached ? cached.nextCursor : undefined
            };
        });
        return map;
    });

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
                distance: 3, // Very small distance to trigger drag easily from the handle
            },
        })
    );

    const [isFiltering, setIsFiltering] = useState(false);
    const [isCurrentlyFiltered, setIsCurrentlyFiltered] = useState(false);

    // Server-side filtering effect
    useEffect(() => {
        let isAborted = false;

        const timer = setTimeout(async () => {
            // Check if there are truly any filters active that should bypass the local cache
            const activeFilterCount = Object.values(filters).filter(v => v !== undefined && v !== "").length;
            const isBaseProjectView = !searchQuery && (activeFilterCount === 0 || (activeFilterCount === 1 && filters.projectId === projectId));
            const hasFilters = !isBaseProjectView;

            if (!hasFilters) {
                // Reset to initial unfiltered data ONLY if we were previously filtering
                if (isCurrentlyFiltered) {
                    const contextId = projectId || "";
                    const resetData: any = {};

                    COLUMNS.forEach(col => {
                        const cacheKey = `${workspaceId}-${contextId}-${col.id}`;
                        const cached = useTaskCacheStore.getState().getKanbanTasksCache(cacheKey);

                        // Use Cache > InitialData
                        resetData[col.id] = {
                            subTasks: cached && cached.tasks.length > 0 ? cached.tasks : initialData[col.id].subTasks,
                            totalCount: cached ? (cached.totalCount ?? 0) : initialData[col.id].totalCount,
                            hasMore: cached ? cached.hasMore : initialData[col.id].hasMore,
                            nextCursor: cached ? cached.nextCursor : undefined,
                        };
                    });

                    if (!isAborted) {
                        setColumnData(resetData);
                        setIsCurrentlyFiltered(false);
                        setLoadingColumns(Object.fromEntries(COLUMNS.map(col => [col.id, false])) as any);
                        setIsFiltering(false);
                    }
                } else {
                    if (!isAborted) setIsFiltering(false);
                }
                return;
            }

            if (isAborted) return;
            setIsCurrentlyFiltered(true);

            // Set loading state
            setLoadingColumns(Object.fromEntries(COLUMNS.map(col => [col.id, true])) as Record<TaskStatus, boolean>);

            try {
                const targetProjectId = filters.projectId || projectId;

                const response = await loadTasksAction({
                    workspaceId,
                    projectId: targetProjectId,
                    hierarchyMode: "children",
                    includeFacets: false,
                    limit: 100,
                    status: undefined,
                    startDate: filters.startDate ? new Date(filters.startDate).toISOString() : undefined,
                    endDate: filters.endDate ? new Date(filters.endDate).toISOString() : undefined,
                    search: searchQuery,
                    assigneeId: filters.assigneeId,
                    tagId: filters.tagId,
                    filterParentTaskId: filters.parentTaskId,
                });

                if (isAborted) return;

                if (response.success && response.data) {
                    const activeFilterCount = Object.values(filters).filter(v => v !== undefined && v !== "").length;
                    const groupedData: any = {};

                    COLUMNS.forEach(col => {
                        const colTasks = response.data.tasksByStatus[col.id] || [];
                        const isSearch = !!searchQuery;

                        groupedData[col.id] = {
                            subTasks: colTasks,
                            // If we only fetched a sub-set via filter, we don't know the REAL total for that status
                            // unless the server gives it to us. For now, keep the initial total if it's just a light filter
                            // otherwise use the length as an approximation.
                            totalCount: isSearch || activeFilterCount > 1
                                ? colTasks.length
                                : (columnData[col.id].totalCount || colTasks.length),
                            hasMore: colTasks.length >= 100,
                            nextCursor: null
                        };
                    });
                    setColumnData(groupedData);
                } else {
                    toast.error("Failed to apply filters");
                }
            } catch (err) {
                console.error("Error filtering subtasks", err);
                if (!isAborted) toast.error("Failed to apply filters");
            } finally {
                if (!isAborted) {
                    setLoadingColumns(Object.fromEntries(COLUMNS.map(col => [col.id, false])) as Record<TaskStatus, boolean>);
                    setIsFiltering(false);
                }
            }

        }, 300); // Debounce

        return () => {
            isAborted = true;
            clearTimeout(timer);
        };
    }, [filters, searchQuery, workspaceId, projectId, initialData]);

    const handleFilterChange = (val: TaskFilters) => {
        setIsFiltering(true);
        setFilters(val);
    };

    const handleSearchChange = (val: string) => {
        setIsFiltering(true);
        setSearchQuery(val);
    };

    const handleLoadMore = async (status: TaskStatus) => {
        setLoadingColumns(prev => ({ ...prev, [status]: true }));

        try {
            const currentCursor = columnData[status].nextCursor;
            const activeFilters = (searchQuery || Object.keys(filters).length > 0)
                ? {
                    ...filters,
                    startDate: filters.startDate ? new Date(filters.startDate).toISOString() : undefined,
                    endDate: filters.endDate ? new Date(filters.endDate).toISOString() : undefined,
                    search: searchQuery
                }
                : undefined;

            const targetProjectId = filters.projectId || projectId;

            const response = await loadTasksAction({
                workspaceId,
                status: [status],
                projectId: targetProjectId,
                cursor: currentCursor,
                limit: 10,
                hierarchyMode: "children",
                ...activeFilters
            });

            if (!response.success) {
                toast.error(response.error || "Failed to load more subtasks");
                return;
            }

            setColumnData(prev => {
                const existingTasks = prev[status].subTasks;
                const newTasks = response.data.tasks;

                // Deduplicate using a Map
                const taskMap = new Map();
                existingTasks.forEach(t => taskMap.set(t.id, t));
                newTasks.forEach(t => taskMap.set(t.id, t));

                const deduplicatedTasks = Array.from(taskMap.values());

                const newData = {
                    ...prev,
                    [status]: {
                        subTasks: deduplicatedTasks,
                        totalCount: response.data.totalCount ?? prev[status].totalCount,
                        hasMore: response.data.hasMore,
                        nextCursor: response.data.nextCursor,
                    }
                };

                // Update Cache (only if no filters)
                const isFiltered = searchQuery || Object.keys(filters).length > 0;
                if (!isFiltered) {
                    const contextId = projectId || "";
                    const cacheKey = `${workspaceId}-${contextId}-${status}`;
                    setKanbanTasksCache(cacheKey, {
                        tasks: deduplicatedTasks,
                        hasMore: response.data.hasMore,
                        nextCursor: response.data.nextCursor,
                        totalCount: response.data.totalCount ?? undefined
                    });
                }

                return newData;
            });
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
        const fromTasks = columnData[fromStatus].subTasks;
        const task = fromTasks.find(t => t.id === subTaskId);

        if (!task) return;

        const updatedTask = { ...task, status: toStatus };
        const toTasks = columnData[toStatus].subTasks;

        // Ensure we don't add a duplicate if it already exists in the target column
        const alreadyInTarget = toTasks.some(t => t.id === subTaskId);

        const newFromTasks = fromTasks.filter(t => t.id !== subTaskId);
        const newToTasks = alreadyInTarget ? toTasks : [updatedTask, ...toTasks];

        const newFromCount = columnData[fromStatus].totalCount - 1;
        const newToCount = alreadyInTarget ? columnData[toStatus].totalCount : columnData[toStatus].totalCount + 1;

        setColumnData(prev => ({
            ...prev,
            [fromStatus]: {
                ...prev[fromStatus],
                subTasks: newFromTasks,
                totalCount: newFromCount,
            },
            [toStatus]: {
                ...prev[toStatus],
                subTasks: newToTasks,
                totalCount: newToCount,
            }
        }));

        // Update Cache (only if no filters) to maintain consistency across re-renders/syncs
        const isFiltered = searchQuery || Object.keys(filters).length > 0;
        if (!isFiltered) {
            const contextId = projectId || "";
            const fromCacheKey = `${workspaceId}-${contextId}-${fromStatus}`;
            const toCacheKey = `${workspaceId}-${contextId}-${toStatus}`;

            setKanbanTasksCache(fromCacheKey, {
                tasks: newFromTasks,
                hasMore: columnData[fromStatus].hasMore,
                nextCursor: columnData[fromStatus].nextCursor,
                totalCount: newFromCount
            });

            setKanbanTasksCache(toCacheKey, {
                tasks: newToTasks,
                hasMore: columnData[toStatus].hasMore,
                nextCursor: columnData[toStatus].nextCursor,
                totalCount: newToCount
            });
        }
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

    const memberOptions = Array.from(
        new Map(
            projectMembers.map(member => [
                member.workspaceMember.user.id,
                {
                    id: member.workspaceMember.user.id,
                    name: member.workspaceMember.user.name,
                    surname: member.workspaceMember.user.surname || undefined,
                }
            ])
        ).values()
    );

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
                tags={tags}
                parentTasks={uniqueParentTasks}
                kanbanColumnVisibility={visibleColumns}
                setKanbanColumnVisibility={setVisibleColumns}
                onFilterChange={handleFilterChange}
                onSearchChange={handleSearchChange}
                onClearAll={() => {
                    setIsFiltering(true);
                    setFilters({});
                    setSearchQuery("");
                }}
            />

            <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
                autoScroll={true}
            >
                <div className="relative">
                    {/* Loading Overlay */}
                    {isFiltering && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm transition-all duration-300 rounded-md">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <span className="text-sm font-medium text-muted-foreground">Filtering...</span>
                            </div>
                        </div>
                    )}
                    <div className={cn(
                        "flex gap-4 h-[calc(100dvh-280px)] overflow-x-auto pb-2 mt-0",
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
