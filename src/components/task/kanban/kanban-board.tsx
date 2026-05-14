"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import type { SubTasksByStatusResponse, KanbanSubTaskType } from "@/types/task";
import type { ProjectMembersType } from "@/types/project";
import { cn } from "@/lib/utils";
import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";
import { toast } from "sonner";
import { KanbanCard } from "./kanban-card";
import { KanbanColumn } from "./kanban-column";
import type { TaskFilters, ProjectOption } from "../shared/types";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/colors/status-colors";
import { apiClient } from "@/lib/api-client";
import {
  GlobalFilterToolbar,
  ParentTaskOption,
} from "../shared/global-filter-toolbar";
import { ActivityDialog } from "@/app/w/[workspaceId]/p/[slug]/_components/forms/activity-form";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import { Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";
import { UserPermissionsType } from "@/data/user/get-user-permissions";
import { useFilterStore } from "@/lib/store/filter-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { workspacesClient } from "@/lib/api-client/workspaces";

export type TaskStatus =
  | "TO_DO"
  | "IN_PROGRESS"
  | "CANCELLED"
  | "REVIEW"
  | "HOLD"
  | "COMPLETED";

interface KanbanBoardProps {
  initialData: Record<TaskStatus, SubTasksByStatusResponse> | null;
  isShell?: boolean;
  projectMembers: ProjectMembersType;
  workspaceId: string;
  projectId: string;
  level?: "project" | "workspace";
  projectManagers?: Record<string, any>;
  permissions?: UserPermissionsType;
  userId?: string;
}

export const COLUMNS: {
  id: TaskStatus;
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
}[] = [
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
  level = "project",
  projectManagers,
  permissions,
  userId,
  isShell = false,
}: KanbanBoardProps) {
  const { data: layoutData } = useWorkspaceLayout();
  const projects = layoutData.projects || [];
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchTags = async () => {
      try {
        const workspaceTags = await workspacesClient.getTags(workspaceId);
        if (mounted) {
          setTags(workspaceTags.map((t) => ({ id: t.id, name: t.name })));
        }
      } catch (error) {
        console.error("Failed to fetch tags for KanbanBoard:", error);
      }
    };
    fetchTags();

    // Debug: Print project managers
    console.log("DEBUG: Kanban Project Managers:", projectManagers);

    return () => {
      mounted = false;
    };
  }, [workspaceId, projectManagers]);
  const isMobile = useIsMobile();
  const [kanbanTasks, setKanbanTasks] = useState<Record<string, any[]>>({});

  const projectMap = useMemo(() => {
    const map: Record<string, ProjectOption> = {};
    projects?.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [projects]);

  const lastSyncRef = useRef<Record<string, number>>({});
  const isSubmittingActivityRef = useRef(false);

  const renderCount = useRef(0);
  renderCount.current++;
  const hasFetchedRef = useRef(
    isShell &&
    initialData &&
    Object.values(initialData).some(
      (col: any) =>
        (col.tasks || col.subTasks) &&
        (col.tasks?.length > 0 || col.subTasks?.length > 0),
    ),
  );
  logger.perf("KANBAN_RENDER", 0, { count: renderCount.current });

  // State for each column's data - INITIALIZE WITH PROPS ONLY FOR HYDRATION SAFETY
  const [columnData, setColumnData] = useState<
    Record<
      TaskStatus,
      {
        subTaskIds: string[];
        totalCount: number;
        hasMore: boolean;
        nextCursor: any;
      }
    >
  >(() => {
    const map: any = {};
    COLUMNS.forEach((col) => {
      const serverCol = initialData ? initialData[col.id] : null;
      map[col.id] = {
        subTaskIds: [],
        totalCount: 0,
        hasMore: false,
        nextCursor: null,
      };

      if (serverCol) {
        const colTasks = (serverCol as any).tasks || (serverCol as any).subTasks || [];
        map[col.id] = {
          subTaskIds: Array.from(new Set(colTasks.map((t: any) => t.id))),
          totalCount: serverCol.totalCount,
          hasMore: serverCol.hasMore,
          nextCursor: serverCol.nextCursor,
        };
      }
    });
    return map;
  });

  // Hydrate tasks state
  useEffect(() => {
    if (initialData) {
      const newTasks: Record<string, any[]> = {};
      COLUMNS.forEach((col) => {
        const serverCol = initialData[col.id];
        if (serverCol) {
          newTasks[col.id] = (serverCol as any).tasks || (serverCol as any).subTasks || [];
        }
      });
      setKanbanTasks(newTasks);
    }
  }, [initialData]);

  // 🧹 Filter Reset Logic: Ensures a clean slate when navigating between different views
  const { filters, setFilters, searchQuery, setSearchQuery, clearFilters } =
    useFilterStore();

  useEffect(() => {
    return () => {
      clearFilters();
    };
  }, [clearFilters, workspaceId, projectId]);

  useEffect(() => {
    const handleRealtimeSync = (e: Event) => {
      const { action, record } = (e as CustomEvent).detail || {};
      if (!action || !record) return;

      // Relevance guard: only apply if event is for this workspace/project
      const isRelevant =
        !projectId ||
        record.projectId === projectId ||
        level === "workspace";

      if (!isRelevant) return;

      if (action === "TASK_CREATED") {
        const status: TaskStatus = (record.status as TaskStatus) || "TO_DO";
        const entityId = record.id;
        if (!entityId) return;

        // Inject into the correct column
        setKanbanTasks(prev => ({
          ...prev,
          [status]: [record, ...(prev[status] || [])]
        }));

        setColumnData((prev) => {
          if (prev[status]?.subTaskIds.includes(entityId)) return prev;
          return {
            ...prev,
            [status]: {
              ...prev[status],
              subTaskIds: [entityId, ...prev[status].subTaskIds],
              totalCount: prev[status].totalCount + 1,
            },
          };
        });
      }

      if (action === "TASK_DELETED") {
        const entityId = record.id;
        if (!entityId) return;

        setKanbanTasks(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(status => {
            next[status] = next[status].filter(t => t.id !== entityId);
          });
          return next;
        });

        setColumnData((prev) => {
          const next = { ...prev };
          COLUMNS.forEach((col) => {
            if (next[col.id].subTaskIds.includes(entityId)) {
              next[col.id] = {
                ...next[col.id],
                subTaskIds: next[col.id].subTaskIds.filter((id) => id !== entityId),
                totalCount: Math.max(0, next[col.id].totalCount - 1),
              };
            }
          });
          return next;
        });
      }

      if (action === "TASK_UPDATED") {
        const entityId = record.id;
        if (!entityId) return;

        // If status changed, move across columns
        if (record.status && record.previousStatus && record.status !== record.previousStatus) {
          const fromStatus = record.previousStatus as TaskStatus;
          const toStatus = record.status as TaskStatus;

          setKanbanTasks(prev => {
            const next = { ...prev };
            const task = next[fromStatus]?.find(t => t.id === entityId);
            if (task) {
              next[fromStatus] = next[fromStatus].filter(t => t.id !== entityId);
              next[toStatus] = [{ ...task, ...record }, ...(next[toStatus] || [])];
            }
            return next;
          });

          setColumnData((prev) => {
            if (!prev[fromStatus] || !prev[toStatus]) return prev;
            if (!prev[fromStatus].subTaskIds.includes(entityId)) return prev;
            return {
              ...prev,
              [fromStatus]: {
                ...prev[fromStatus],
                subTaskIds: prev[fromStatus].subTaskIds.filter((id) => id !== entityId),
                totalCount: Math.max(0, prev[fromStatus].totalCount - 1),
              },
              [toStatus]: {
                ...prev[toStatus],
                subTaskIds: prev[toStatus].subTaskIds.includes(entityId)
                  ? prev[toStatus].subTaskIds
                  : [entityId, ...prev[toStatus].subTaskIds],
                totalCount: prev[toStatus].subTaskIds.includes(entityId)
                  ? prev[toStatus].totalCount
                  : prev[toStatus].totalCount + 1,
              },
            };
          });
        } else {
          // Normal update within same column
          const status = record.status as TaskStatus;
          setKanbanTasks(prev => ({
            ...prev,
            [status]: (prev[status] || []).map(t => t.id === entityId ? { ...t, ...record } : t)
          }));
        }
      }
    };

    window.addEventListener("realtime-sync-refresh", handleRealtimeSync);
    return () => window.removeEventListener("realtime-sync-refresh", handleRealtimeSync);
  }, [workspaceId, projectId, level]);

  // Hydrate state from cache after resh props

  const [visibleColumns, setVisibleColumns] = useState<
    Record<TaskStatus, boolean>
  >(
    COLUMNS.reduce(
      (acc, col) => ({ ...acc, [col.id]: true }),
      {} as Record<TaskStatus, boolean>,
    ),
  );
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [loadingColumns, setLoadingColumns] = useState<
    Record<TaskStatus, boolean>
  >(
    Object.fromEntries(COLUMNS.map((col) => [col.id, false])) as Record<
      TaskStatus,
      boolean
    >,
  );

  const [activeSubTask, setActiveSubTask] = useState<KanbanSubTaskType | null>(
    null,
  );
  const [overInfo, setOverInfo] = useState<{
    overId: string | null;
    columnId: TaskStatus | null;
  }>({ overId: null, columnId: null });

  const { openSubTaskSheet } = useSubTaskSheetActions();
  // const reloadView = useReloadView();

  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);
  const [pendingReviewMove, setPendingReviewMove] = useState<{
    subTaskId: string;
    previousStatus: TaskStatus;
    targetStatus: TaskStatus;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: isMobile ? { delay: 300, tolerance: 5 } : { distance: 3 },
    }),
  );

  const [isFiltering, setIsFiltering] = useState(false);
  const [isCurrentlyFiltered, setIsCurrentlyFiltered] = useState(false);

  // Server-side filtering effect
  useEffect(() => {
    let isAborted = false;

    const timer = setTimeout(async () => {
      // Check if there are truly any filters active that should bypass the local cache
      const activeFilterCount = Object.values(filters).filter(
        (v) => v !== undefined && v !== "",
      ).length;
      const isBaseProjectView =
        !searchQuery &&
        (activeFilterCount === 0 ||
          (activeFilterCount === 1 && filters.projectId === projectId));
      const hasFilters = !isBaseProjectView;
      const isBoardEmpty = Object.values(columnData).every(
        (col) => col.subTaskIds.length === 0,
      );

      // 🛡️ Mount Guard: If we have initial data and filters are neutral, skip the first fetch
      const isNeutral =
        !searchQuery &&
        Object.values(filters).every(
          (v) =>
            v === undefined || v === "" || (Array.isArray(v) && v.length === 0),
        );

      const hasInitialData =
        initialData &&
        Object.values(initialData).some(
          (col: any) =>
            (col.tasks || col.subTasks) &&
            (col.tasks?.length > 0 || col.subTasks?.length > 0),
        );

      if (!hasFetchedRef.current && hasInitialData && isNeutral) {
        hasFetchedRef.current = true;
        setIsFiltering(false);
        return;
      }

      // 🔄 Revalidation Logic:
      // Fetch if (has filters) OR (board is empty) OR (previously filtered and now resetting) OR (first mount)
      const shouldFetch =
        hasFilters || isBoardEmpty || isCurrentlyFiltered || !hasFetchedRef.current;

      if (!shouldFetch) {
        // Reset to initial unfiltered data ONLY if we were previously filtering
        if (isCurrentlyFiltered) {
          // Reset to initial unfiltered data
          if (isCurrentlyFiltered) {
            const resetData: any = {};
            const resetTasks: any = {};

            COLUMNS.forEach((col) => {
              const serverCol = initialData?.[col.id];
              const tasks = (serverCol as any)?.tasks || (serverCol as any)?.subTasks || [];

              resetData[col.id] = {
                subTaskIds: tasks.map((t: any) => t.id),
                totalCount: serverCol?.totalCount || 0,
                hasMore: serverCol?.hasMore || false,
                nextCursor: serverCol?.nextCursor || undefined,
              };
              resetTasks[col.id] = tasks;
            });

            if (!isAborted) {
              setColumnData(resetData);
              setKanbanTasks(resetTasks);
              setIsCurrentlyFiltered(false);
              setLoadingColumns(
                Object.fromEntries(COLUMNS.map((col) => [col.id, false])) as any,
              );
              setIsFiltering(false);
            }
          }
        } else {
          if (!isAborted) setIsFiltering(false);
        }
        return;
      }

      if (isAborted) return;
      setIsCurrentlyFiltered(true);

      // Performance Tracking for Filtering
      const startTime = performance.now();

      // Set loading state
      setLoadingColumns(
        Object.fromEntries(COLUMNS.map((col) => [col.id, true])) as Record<
          TaskStatus,
          boolean
        >,
      );

      try {
        const targetProjectId = filters.projectId || projectId;
        const params = new URLSearchParams();
        params.set("w", workspaceId);
        if (targetProjectId) params.set("p", targetProjectId);
        params.set("vm", "kanban");
        params.set("excludeParents", "true");
        params.set("l", "5");
        params.set("facets", "true");
        if (searchQuery) params.set("q", searchQuery);
        if (filters.assigneeId) params.set("a", filters.assigneeId);
        if (filters.tagId) params.set("t", filters.tagId);
        if (filters.startDate)
          params.set("da", new Date(filters.startDate).toISOString());
        if (filters.endDate)
          params.set("db", new Date(filters.endDate).toISOString());
        if (filters.dueDateFilter)
          params.set("dt", filters.dueDateFilter);
        if (filters.parentTaskId) params.set("pt", filters.parentTaskId);
        params.set("ef", JSON.stringify(["description"]));

        const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);

        if (!apiRes.ok) {
          if (apiRes.status === 401) {
            if (!isAborted) toast.error("Session expired. Please log in again.");
            return;
          }
          throw new Error(`API returned ${apiRes.status}`);
        }

        const response = await apiRes.json();

        if (isAborted) return;

        if (response.success && response.data) {
          // Log payload weight for optimization verification
          const sizeInBytes = new TextEncoder().encode(
            JSON.stringify(response.data),
          ).length;
          console.log(
            `%c[KANBAN_WEIGHT] Data: ${(sizeInBytes / 1024).toFixed(2)} KB`,
            "color: #10b981; font-weight: bold;",
          );

          const counts = (response.data.facets as any)?.status || {};
          const groupedData: any = {};
          const groupedTasks: any = {};

          COLUMNS.forEach((col) => {
            const serverCol = response.data.tasksByStatus[col.id];
            const allColTasks = serverCol?.tasks || [];
            // Don't display parent as a card
            const colTasks = allColTasks.filter((t: any) => !t.isParent);

            // Use the server-provided pagination state directly
            groupedData[col.id] = {
              subTaskIds: Array.from(new Set(colTasks.map((t: any) => t.id))),
              totalCount: counts[col.id] || colTasks.length,
              hasMore: serverCol?.hasMore || false,
              nextCursor: serverCol?.nextCursor || null,
            };
            groupedTasks[col.id] = colTasks;
          });
          setColumnData(groupedData);
          setKanbanTasks(groupedTasks);

          const duration = performance.now() - startTime;
          logger.perf("KANBAN_FILTER_APPLIED", duration, {
            workspaceId,
            projectId,
            search: searchQuery,
          });
        } else {
          if (!isAborted) toast.error(response.error || "Failed to apply filters");
        }
      } catch (err) {
        if (!isAborted) {
          console.error("Error filtering subtasks", err);
          toast.error("Network error. Please check your connection.");
        }
      } finally {
        if (!isAborted) {
          setLoadingColumns(
            Object.fromEntries(COLUMNS.map((col) => [col.id, false])) as Record<
              TaskStatus,
              boolean
            >,
          );
          setIsFiltering(false);
          setIsCurrentlyFiltered(hasFilters);
          hasFetchedRef.current = true; // Mark as fetched after successful background refresh
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
    if (loadingColumns[status] || !columnData[status].hasMore) return;
    setLoadingColumns((prev) => ({ ...prev, [status]: true }));

    try {
      const currentCursor = columnData[status].nextCursor;
      const activeFilters =
        searchQuery || Object.keys(filters).length > 0
          ? {
            ...filters,
            startDate: filters.startDate
              ? new Date(filters.startDate).toISOString()
              : undefined,
            endDate: filters.endDate
              ? new Date(filters.endDate).toISOString()
              : undefined,
            search: searchQuery,
          }
          : undefined;

      const targetProjectId = filters.projectId || projectId;

      // Build the URL with short parameters (w, s, l, vm, p, c, q)
      const params = new URLSearchParams();
      params.set("w", workspaceId);
      params.set("s", status);
      params.set("l", "10");
      params.set("vm", "kanban");

      if (targetProjectId) params.set("p", targetProjectId);
      if (currentCursor) params.set("c", JSON.stringify(currentCursor));
      if (searchQuery) params.set("q", searchQuery);

      // Filters
      if (filters.assigneeId) params.append("a", filters.assigneeId);
      if (filters.tagId) params.append("t", filters.tagId);
      if (filters.dueDateFilter) params.append("dt", filters.dueDateFilter);
      params.set("ef", JSON.stringify(["description"]));

      const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
      const response = await apiRes.json();

      if (!response.success) {
        toast.error(response.error || "Failed to load more subtasks");
        return;
      }

      // Log payload weight for Load More optimization verification
      const sizeInBytes = new TextEncoder().encode(
        JSON.stringify(response.data),
      ).length;
      console.log(
        `%c[KANBAN_LOAD_MORE_WEIGHT] ${status}: ${(sizeInBytes / 1024).toFixed(2)} KB`,
        "color: #3b82f6; font-weight: bold;",
      );

      const allNewTasks = response.data.tasks || [];
      // STRICT: Only tasks whose status matches AND are not parents
      const newTasks = allNewTasks.filter(
        (t: any) => !t.isParent && t.status === status,
      );

      // 1. Prepare data for update
      const counts = (response.data.facets as any)?.status || {};

      setKanbanTasks(prev => ({
        ...prev,
        [status]: [...(prev[status] || []), ...newTasks]
      }));
      setColumnData((prev) => ({
        ...prev,
        [status]: {
          ...prev[status],
          subTaskIds: Array.from(
            new Set([...prev[status].subTaskIds, ...newTasks.map((t: any) => t.id)]),
          ),
          totalCount: counts[status] || prev[status].totalCount + newTasks.length,
          hasMore: response.data.hasMore || false,
          nextCursor: response.data.nextCursor || null,
        },
      }));
    } catch (error) {
      console.error(`Error loading more subtasks for ${status}:`, error);
      toast.error("Failed to load more subtasks");
    } finally {
      setLoadingColumns((prev) => ({ ...prev, [status]: false }));
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const subTask = kanbanTasks[overInfo.columnId as TaskStatus]?.find(t => t.id === active.id) ||
      Object.values(kanbanTasks).flat().find(t => t.id === active.id);
    if (subTask) {
      setActiveSubTask(subTask as KanbanSubTaskType);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setOverInfo({ overId: null, columnId: null });
      return;
    }
    const overId = over.id as string;
    const validStatuses: TaskStatus[] = [
      "TO_DO",
      "IN_PROGRESS",
      "CANCELLED",
      "REVIEW",
      "HOLD",
      "COMPLETED",
    ];
    // If dropped directly onto a column, overId is the column status
    if (validStatuses.includes(overId as TaskStatus)) {
      setOverInfo({ overId: null, columnId: overId as TaskStatus });
    } else {
      // overId is a card id — find which column it belongs to
      for (const col of COLUMNS) {
        if (columnData[col.id].subTaskIds.includes(overId)) {
          setOverInfo({ overId, columnId: col.id });
          return;
        }
      }
      setOverInfo({ overId: null, columnId: null });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSubTask(null);
    setOverInfo({ overId: null, columnId: null });

    if (!over) {
      return;
    }

    const subTaskId = active.id as string;
    const overId = over.id as string;

    const validStatuses: TaskStatus[] = [
      "TO_DO",
      "IN_PROGRESS",
      "CANCELLED",
      "REVIEW",
      "HOLD",
      "COMPLETED",
    ];

    // Resolve the target column:
    // 1. If the pointer is directly over a column drop zone, over.id IS the status.
    // 2. If the pointer is over another card, find which column that card belongs to.
    let newStatus: TaskStatus | null = null;
    if (validStatuses.includes(overId as TaskStatus)) {
      newStatus = overId as TaskStatus;
    } else {
      // over.id is a card id — find its column
      for (const col of COLUMNS) {
        if (columnData[col.id].subTaskIds.includes(overId)) {
          newStatus = col.id;
          break;
        }
      }
    }

    if (!newStatus) {
      return;
    }

    let currentStatus: TaskStatus | null = null;
    for (const status of COLUMNS.map((c) => c.id)) {
      if (columnData[status].subTaskIds.includes(subTaskId)) {
        currentStatus = status;
        break;
      }
    }

    const subTask = kanbanTasks[currentStatus as TaskStatus]?.find(t => t.id === subTaskId);

    if (!subTask || !currentStatus || currentStatus === newStatus) {
      return;
    }

    const previousStatus = currentStatus;

    // 1. HARD BLOCK for IN_PROGRESS -> COMPLETED (Must go to REVIEW first)
    if (previousStatus === "IN_PROGRESS" && newStatus === "COMPLETED") {
      toast.error(
        "In-Progress tasks must go to Review before being marked as Completed.",
        { id: "status-block" },
      );
      return;
    }

    const isMandatory =
      ["HOLD", "CANCELLED", "REVIEW"].includes(newStatus) ||
      ["HOLD", "CANCELLED"].includes(previousStatus) ||
      (previousStatus === "REVIEW" &&
        (newStatus === "TO_DO" || newStatus === "IN_PROGRESS")) ||
      (previousStatus === "IN_PROGRESS" && newStatus === "TO_DO");

    if (isMandatory) {
      console.log(`DEBUG [Kanban] Mandatory move detected for ${subTaskId}: ${previousStatus} -> ${newStatus}. Opening Activity Dialog.`);
      // 1. Optimistically move immediately 
      moveSubTaskBetweenColumns(subTaskId, previousStatus, newStatus);

      // 2. Set as "updating" while the dialog is active
      setUpdatingTaskIds(prev => new Set(prev).add(subTaskId));

      setPendingReviewMove({
        subTaskId,
        previousStatus,
        targetStatus: newStatus,
      });
      setIsActivityDialogOpen(true);
    } else {
      performStatusUpdate(subTaskId, newStatus, previousStatus);
    }
    return;
  };

  const moveSubTaskBetweenColumns = (
    subTaskId: string,
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
  ) => {
    console.log(`DEBUG [Kanban] Optimistically moving task ${subTaskId} from ${fromStatus} to ${toStatus}`);
    // 1. Move the actual task object in kanbanTasks (Robust search)
    setKanbanTasks((prev) => {
      const next = { ...prev };
      let taskToMove: any = null;
      let actualFromStatus: TaskStatus | null = null;

      // Find the task anywhere to be safe
      for (const status of Object.keys(next) as TaskStatus[]) {
        const task = next[status]?.find(t => t.id === subTaskId);
        if (task) {
          taskToMove = task;
          actualFromStatus = status;
          break;
        }
      }
      
      if (taskToMove && actualFromStatus) {
        // Remove from actual source
        next[actualFromStatus] = next[actualFromStatus].filter(t => t.id !== subTaskId);
        // Add to target with updated status
        const updatedTask = { ...taskToMove, status: toStatus };
        next[toStatus] = [updatedTask, ...(next[toStatus] || [])];
      }
      return next;
    });

    // 2. Synchronize the LOCAL columnData state immediately (Robust search)
    setColumnData((prev) => {
      const next = { ...prev };
      let actualFromStatus: TaskStatus | null = null;

      for (const status of Object.keys(next) as TaskStatus[]) {
        if (next[status].subTaskIds.includes(subTaskId)) {
          actualFromStatus = status;
          break;
        }
      }

      if (actualFromStatus && next[toStatus]) {
        // Remove from source
        next[actualFromStatus] = {
          ...next[actualFromStatus],
          subTaskIds: next[actualFromStatus].subTaskIds.filter((id) => id !== subTaskId),
          totalCount: Math.max(0, next[actualFromStatus].totalCount - 1),
        };
        // Add to target
        next[toStatus] = {
          ...next[toStatus],
          subTaskIds: next[toStatus].subTaskIds.includes(subTaskId)
            ? next[toStatus].subTaskIds
            : [subTaskId, ...next[toStatus].subTaskIds],
          totalCount: next[toStatus].subTaskIds.includes(subTaskId)
            ? next[toStatus].totalCount
            : next[toStatus].totalCount + 1,
        };
      }
      return next;
    });
  };

  const getTaskProjectId = (subTaskId: string) => {
    // Find task in local state to get its projectId
    for (const status of Object.keys(kanbanTasks) as TaskStatus[]) {
      const task = kanbanTasks[status]?.find(t => t.id === subTaskId);
      if (task && task.projectId) return task.projectId;
    }
    return projectId;
  };

  const updateSubTaskInPlace = (subTaskId: string, data: any) => {
    setKanbanTasks((prev) => {
      const newState = { ...prev };
      for (const status of Object.keys(newState) as TaskStatus[]) {
        if (newState[status]) {
          newState[status] = newState[status].map((t) =>
            t.id === subTaskId ? { ...t, ...data } : t
          );
        }
      }
      return newState;
    });
  };

  const performStatusUpdate = async (
    subTaskId: string,
    newStatus: TaskStatus,
    previousStatus: TaskStatus,
    activityId?: string,
    comment?: string,
    attachmentData?: any,
  ) => {
    console.log(`DEBUG [Kanban] performStatusUpdate starting for ${subTaskId}: ${previousStatus} -> ${newStatus}`);
    // Optimistic move only if status is actually changing and not already moved by drag-end
    if (newStatus !== previousStatus) {
      moveSubTaskBetweenColumns(subTaskId, previousStatus, newStatus);
    }
    setUpdatingTaskIds((prev) => new Set(prev).add(subTaskId));

    const toastId = toast.loading("Updating subtask status...");

    try {
      const targetProjectId = getTaskProjectId(subTaskId) || projectId;

      const result = await apiClient.tasks.updateStatus(
        subTaskId,
        workspaceId,
        targetProjectId,
        newStatus,
        comment,
        attachmentData,
      );

      if (result.status === "success") {
        console.log(`DEBUG [Kanban] API success for ${subTaskId}. Updating task data in-place.`);
        if (result.data) {
          updateSubTaskInPlace(subTaskId, result.data);
        }
        toast.success("Subtask status updated successfully", {
          id: toastId,
        });
      } else {
        console.warn(`DEBUG [Kanban] API error for ${subTaskId}:`, result.message);
        moveSubTaskBetweenColumns(subTaskId, newStatus, previousStatus);
        toast.error(result.message || "Failed to update subtask status", {
          id: toastId,
        });
      }
    } catch (error: any) {
      console.error(`DEBUG [Kanban] Network/System error for ${subTaskId}:`, error);
      moveSubTaskBetweenColumns(subTaskId, newStatus, previousStatus);
      const errorMessage =
        error?.message || "Failed to update subtask status. Let's try again.";
      toast.error(errorMessage, {
        id: toastId,
      });
      console.error("Error updating subtask status:", error);
    } finally {
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(subTaskId);
        return next;
      });
    }
  };

  const handleDragCancel = () => {
    setActiveSubTask(null);
    setOverInfo({ overId: null, columnId: null });
  };

  const handleManualStatusChange = (
    subTaskId: string,
    newStatus: TaskStatus,
    currentStatus: TaskStatus,
  ) => {
    // Re-use the same validation logic as handleDragEnd
    if (currentStatus === "IN_PROGRESS" && newStatus === "COMPLETED") {
      toast.error(
        "In-Progress tasks must go to Review before being marked as Completed.",
        { id: "status-block" },
      );
      return;
    }

    const isMandatory =
      ["HOLD", "CANCELLED", "REVIEW"].includes(newStatus) ||
      ["HOLD", "CANCELLED"].includes(currentStatus) ||
      (currentStatus === "REVIEW" &&
        (newStatus === "TO_DO" || newStatus === "IN_PROGRESS")) ||
      (currentStatus === "IN_PROGRESS" && newStatus === "TO_DO");

    if (isMandatory) {
      moveSubTaskBetweenColumns(subTaskId, currentStatus, newStatus);
      // Set as "updating" while the dialog is active
      setUpdatingTaskIds(prev => new Set(prev).add(subTaskId));

      setPendingReviewMove({
        subTaskId,
        previousStatus: currentStatus,
        targetStatus: newStatus,
      });
      setIsActivityDialogOpen(true);
    } else {
      performStatusUpdate(subTaskId, newStatus, currentStatus);
    }
  };

  const handleSubTaskClick = (subTask: KanbanSubTaskType) => {
    openSubTaskSheet(subTask);
  };

  const handleActivitySubmit = async (
    commentStr: string,
    attachmentLink?: string,
  ) => {
    if (!pendingReviewMove) return;

    const { subTaskId, targetStatus, previousStatus } = pendingReviewMove;
    console.log(`DEBUG [Kanban] Activity Dialog submitted for ${subTaskId}. Target: ${targetStatus}`);
    
    // 1. Mark as submitting so handleActivityClose doesn't revert the optimistic move
    isSubmittingActivityRef.current = true;

    // 2. Instantly close dialog and clear pending move to make it feel "done"
    setPendingReviewMove(null);
    setIsActivityDialogOpen(false);

    try {
      let attachmentData = null;
      if (attachmentLink) {
        attachmentData = {
          url: attachmentLink,
        };
      }

      // 2. Perform the update in the background (exactly like non-mandatory moves)
      // We pass the actual previousStatus so that if the update fails, 
      // performStatusUpdate can correctly revert it.
      await performStatusUpdate(
        subTaskId,
        targetStatus,
        previousStatus,
        undefined,
        commentStr,
        attachmentData,
      );
    } catch (error) {
      console.error("Error submitting activity in background:", error);
      toast.error("An unexpected error occurred. Please try again.");
      // If it fails, we set it to false so that if the user tries to cancel now, it works.
      isSubmittingActivityRef.current = false;
    }
  };

  const handleActivityClose = () => {
    // 🛡️ Guard: If we are closing because of a successful submission, don't revert!
    if (isSubmittingActivityRef.current) {
      console.log("DEBUG [Kanban] Activity Dialog closing due to submission. Skipping reversion and resetting ref.");
      isSubmittingActivityRef.current = false;
      return;
    }

    if (pendingReviewMove) {
      const { subTaskId } = pendingReviewMove;
      console.log(`DEBUG [Kanban] Activity Dialog cancelled/closed for ${subTaskId}. Reverting move to ${pendingReviewMove.previousStatus}`);

      // Remove from updating state
      setUpdatingTaskIds(prev => {
        const next = new Set(prev);
        next.delete(subTaskId);
        return next;
      });

      // Revert optimistic move if the dialog was closed without submission
      moveSubTaskBetweenColumns(
        subTaskId,
        pendingReviewMove.targetStatus,
        pendingReviewMove.previousStatus,
      );
      setPendingReviewMove(null);
    }
    setIsActivityDialogOpen(false);
  };

  const getFilteredSubTaskIds = (status: TaskStatus) => {
    return columnData[status]?.subTaskIds || [];
  };

  const uniqueParentTasks = useMemo(() => {
    const parentMap = new Map<string, ParentTaskOption>();

    // Extract from currently loaded items in Kanban columns
    Object.values(kanbanTasks).forEach((tasks) => {
      tasks.forEach((st) => {
        if (st?.parentTask?.id) {
          parentMap.set(st.parentTask.id, {
            id: st.parentTask.id,
            name: st.parentTask.name,
            taskSlug: st.parentTask.taskSlug,
          });
        }
      });
    });

    return Array.from(parentMap.values());
  }, [kanbanTasks]);

  // handleRequestSubtasks: Triggers explicit expansion for a parent task.
  // Although Kanban is flat, this hydrates the cache allowing filter-by-parent to work instantly.
  const handleRequestSubtasks = useCallback(
    async (parentId: string) => {
      // In this new architecture, we don't need to manually hydrate a global cache.
      // Filtering by parent works on the already-loaded kanbanTasks.
      console.log("Parent filter applied for:", parentId);
    },
    [],
  );

  const memberOptions = Array.from(
    new Map(
      projectMembers.map((member) => [
        member.userId,
        {
          id: member.userId,
          surname: member.user?.surname || undefined,
        },
      ]),
    ).values(),
  );

  // Bi-directional filtering logic
  const filteredProjects = projects?.filter(
    (p) =>
      !filters.assigneeId ||
      (p.memberIds && p.memberIds.includes(filters.assigneeId)),
  );

  const filteredMembers = memberOptions.filter((m) => {
    if (!filters.projectId) return true;
    const project = projects?.find((p) => p.id === filters.projectId);
    return project?.memberIds?.includes(m.id);
  });

  return (
    <div className="space-y-4">
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
        onDragOver={handleDragOver}
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
                <span className="text-sm font-medium text-muted-foreground">
                  Filtering...
                </span>
              </div>
            </div>
          )}
          <div
            className={cn(
              "flex gap-4 overflow-x-auto pb-2",
              level === "workspace" ? "h-[70vh] mt-0" : "h-[65vh]",
              // Custom horizontal scrollbar
              "[&::-webkit-scrollbar]:h-2",
              "[&::-webkit-scrollbar-track]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:bg-accent",
              "[&::-webkit-scrollbar-thumb]:rounded-full",
              "[&::-webkit-scrollbar-thumb]:hover:bg-accent/50",
            )}
          >
            {COLUMNS.filter((col) => visibleColumns[col.id]).map((column) => {
              const tasks = kanbanTasks[column.id] || [];
              return (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  tasks={tasks}
                  totalCount={columnData[column.id].totalCount}
                  hasMore={columnData[column.id].hasMore}
                  isLoadingMore={loadingColumns[column.id]}
                  onSubTaskClick={handleSubTaskClick}
                  onLoadMore={() => handleLoadMore(column.id)}
                  projectManagers={projectManagers}
                  projectMembers={projectMembers}
                  updatingTaskIds={updatingTaskIds}
                  activeTaskId={activeSubTask?.id ?? null}
                  overCardId={
                    overInfo.columnId === column.id ? overInfo.overId : null
                  }
                  isOverColumn={overInfo.columnId === column.id}
                  permissions={permissions}
                  userId={userId}
                  projects={projects}
                  projectMap={projectMap}
                  isMobile={isMobile}
                  onStatusChange={handleManualStatusChange}
                />
              );
            })}
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeSubTask ? (
            <div className="rotate-3 opacity-80">
              <KanbanCard
                subTask={activeSubTask}
                columnColor="text-slate-700"
                isDragging
                projectManagers={projectManagers}
                projectMembers={projectMembers}
                projects={projects}
                projectMap={projectMap}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <ActivityDialog
        isOpen={isActivityDialogOpen}
        onClose={handleActivityClose}
        onSubmit={handleActivitySubmit}
        subTaskName={
          pendingReviewMove
            ? Object.values(kanbanTasks).flat().find(t => t.id === pendingReviewMove.subTaskId)?.name || "Subtask"
            : ""
        }
      />
    </div>
  );
}
