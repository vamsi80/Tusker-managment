"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  type TaskWithSubTasks,
  type SortConfig,
  type SortField,
  type TaskFilters,
  hasActiveFilters,
  getActiveFilters
} from "@/components/task/shared/types";
import type { SubTaskType } from "@/types/task";
import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";
import { apiClient } from "@/lib/api-client";
import { ProjectLayoutContext } from "@/app/w/[workspaceId]/p/[slug]/_components/project-layout-context-object";
import { useContext } from "react";
import { useProjectTags } from "@/hooks/use-project-tags";
import { useFilterStore } from "@/lib/store/filter-store";
import { useFilteredFetch } from "@/hooks/use-filtered-fetch";

// Local helper for robust deduplication by ID
const dedupeTasks = (taskList: TaskWithSubTasks[]) => {
  if (!taskList) return [];
  return taskList.filter((t, i, a) => a.findIndex(c => c.id === t.id) === i);
};

export function useTaskTableLogic({
  initialTasks,
  workspaceId,
  projectId,
  level,
  projectCounts,
  projects,
}: any) {

  const {
    filters, setFilters,
    searchQuery, setSearchQuery,
    clearFilters: clearGlobalFilters,
    isCurrentlyFiltered,
    setIsCurrentlyFiltered
  } = useFilterStore();

  // Initialize state directly from initialTasks (no global cache)
  const tags = useProjectTags(workspaceId, projectId || filters.projectId);

  const tasksRef = useRef<TaskWithSubTasks[]>([]);
  const fetchingIdsRef = useRef<Set<string>>(new Set());
  const isInitialMountRef = useRef<boolean>(true);
  const projectPaginationRef = useRef<Record<string, any>>({});
  const processedSubTasksRef = useRef<Set<string>>(new Set());
  const fetchingSubTasksRef = useRef<Set<string>>(new Set());
  const subTaskBatchQueueRef = useRef<Set<string>>(new Set());
  const subTaskBatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manuallyCollapsedRef = useRef<Set<string>>(new Set());
  const loadingMoreSubTasksRef = useRef<Record<string, boolean>>({});

  const [tasks, setTasks] = useState<TaskWithSubTasks[]>(() => dedupeTasks(initialTasks || []));
  const [isSubtaskFirstMode, setIsSubtaskFirstMode] = useState(false);

  // 🚀 Persistent State Sync: Try to use ProjectLayoutContext if available
  const projectCtx = useContext(ProjectLayoutContext);

  const [localExpanded, setLocalExpanded] = useState<Record<string, boolean>>({});
  const expanded = (level === "project" && projectCtx) ? projectCtx.expandedTasks : localExpanded;
  const setExpanded = (level === "project" && projectCtx) ? projectCtx.setExpandedTasks : setLocalExpanded;

  const [loadingSubTasks, setLoadingSubTasks] = useState<Record<string, boolean>>({});
  const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<Record<string, boolean>>({});
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [sorts, setSorts] = useState<SortConfig[]>([]);
  const [sortedTasks, setSortedTasks] = useState<any[]>([]);
  const [sortedHasMore, setSortedHasMore] = useState(false);
  const [sortedNextCursor, setSortedNextCursor] = useState<any>(null);
  const [isLoadingMoreSorted, setIsLoadingMoreSorted] = useState(false);
  const [isSortedViewLoading, setIsSortedViewLoading] = useState(false);
  const [projectPagination, setProjectPagination] = useState<Record<string, any>>({});
  const [activeInlineProjectIdState, setActiveInlineProjectIdState] = useState<string | null>(null);

  const clearFilters = useCallback(() => {
    clearGlobalFilters();
    setIsSubtaskFirstMode(false);
    setIsCurrentlyFiltered(false);
  }, [clearGlobalFilters, setIsCurrentlyFiltered]);
  const [isAutoExpanded, setIsAutoExpanded] = useState(false);

  const { openSubTaskSheet } = useSubTaskSheetActions();

  // Helper: CreatedAt Asc Comparison
  const compareByCreatedAtAsc = useCallback((a: any, b: any) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  }, []);

  // Helper: Field-based Comparison
  const compareByField = useCallback((a: any, b: any, field: SortField, direction: "asc" | "desc") => {
    const dir = direction === "asc" ? 1 : -1;
    let aVal, bVal;
    switch (field) {
      case "name":
        return dir * (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
      case "status":
        const statusOrder: Record<string, number> = { TO_DO: 0, IN_PROGRESS: 1, REVIEW: 2, HOLD: 3, COMPLETED: 4, CANCELLED: 5 };
        return dir * ((statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));
      case "startDate":
      case "createdAt":
        aVal = a[field] ? new Date(a[field]).getTime() : 0;
        bVal = b[field] ? new Date(b[field]).getTime() : 0;
        return dir * (aVal - bVal);
      case "deadline":
      case "dueDate":
        aVal = a.startDate && a.days ? new Date(a.startDate).getTime() + a.days * 86400000 : 0;
        bVal = b.startDate && b.days ? new Date(b.startDate).getTime() + b.days * 86400000 : 0;
        return dir * (aVal - bVal);
      default: return 0;
    }
  }, []);

  const compareTasksFallback = useCallback(
    (a: any, b: any) => {
      const aPos = typeof a?.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
      const bPos = typeof b?.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      return compareByCreatedAtAsc(a, b);
    },
    [compareByCreatedAtAsc],
  );

  // Order Subtasks
  const orderSubTasksForParent = useCallback((parentTaskId: string, subTasks: any[], preferredSource?: any[]) => {
    const deduped = subTasks.filter((s, i, a) => a.findIndex(c => c.id === s.id) === i);
    if (sorts.length > 0) {
      return deduped.sort((a, b) => {
        for (const s of sorts) {
          const res = compareByField(a, b, s.field, s.direction);
          if (res !== 0) return res;
        }
        return compareTasksFallback(a, b);
      });
    }
    return deduped.sort(compareTasksFallback);
  }, [sorts, compareByField, compareTasksFallback]);

  // Order Root Tasks
  const orderRootTasks = useCallback((taskList: TaskWithSubTasks[]) => {
    const deduped = dedupeTasks(taskList);
    const projectRank = new Map();
    projects.forEach((p: any, i: number) => projectRank.set(p.id, i));

    return deduped.sort((a, b) => {
      const aPR = projectRank.get(a.projectId || "") ?? 9999;
      const bPR = projectRank.get(b.projectId || "") ?? 9999;
      if (aPR !== bPR) return aPR - bPR;

      // If within the same project, use the standard fallback (position then createdAt)
      return compareTasksFallback(a, b);
    });
  }, [projects, compareTasksFallback]);

  const normalizeFilteredTasks = useCallback((taskList: TaskWithSubTasks[]) =>
    orderRootTasks(taskList.map((t) => ({
      ...t,
      subTasks: t.subTasks ? orderSubTasksForParent(t.id, t.subTasks) : t.subTasks,
    }))), [orderRootTasks, orderSubTasksForParent]);

  // Normalize and Order
  const hydrateTasks = useCallback((taskList: TaskWithSubTasks[]) => {
    return taskList.map((t) => {
      // Deep Hydrate and Order Subtasks
      let subTasks = t.subTasks;
      let hasMore = t.subTasksHasMore;
      let nextCursor = t.subTasksNextCursor;

      if (subTasks && subTasks.length > 0) {
        subTasks = orderSubTasksForParent(t.id, subTasks);
      }

      return {
        ...t,
        subTasks,
        subTasksHasMore: hasMore,
        subTasksNextCursor: nextCursor
      };
    });
  }, [orderSubTasksForParent]);

  const hydrateTasksRef = useRef(hydrateTasks);
  const normalizeFilteredTasksRef = useRef(normalizeFilteredTasks);
  const orderRootTasksRef = useRef(orderRootTasks);

  useEffect(() => {
    hydrateTasksRef.current = hydrateTasks;
    normalizeFilteredTasksRef.current = normalizeFilteredTasks;
    orderRootTasksRef.current = orderRootTasks;
  }, [hydrateTasks, normalizeFilteredTasks, orderRootTasks]);

  // 🚀 Centralized Filter Fetch Logic
  const {
    isLoading: isLoadingFilters,
    pagination: filterPaginationFromHook,
    loadMore: loadMoreFiltered,
    filtersActive
  } = useFilteredFetch({
    workspaceId,
    projectId,
    level,
    viewMode: "list",
    onResults: useCallback((fetchedTasks: TaskWithSubTasks[], meta: any) => {
      const isFirstMode = meta.isSubtaskFirstMode || false;
      setIsSubtaskFirstMode(isFirstMode);

      if (!isFirstMode) {
        fetchedTasks.forEach((t: TaskWithSubTasks) => {
          if (t.isParent) processedSubTasksRef.current.add(t.id);
        });
      }

      setTasks(hydrateTasksRef.current(orderRootTasksRef.current(fetchedTasks)));
    }, []),
    onAppendResults: useCallback((newTasks: TaskWithSubTasks[]) => {
      setTasks(prev => {
        const existingIds = new Set(prev.map(t => t.id));
        const fresh = newTasks.filter(t => !existingIds.has(t.id));
        const merged = [...prev, ...fresh];
        return hydrateTasksRef.current(merged);
      });
    }, [])
  });

  const filterPagination = {
    ...filterPaginationFromHook,
    isLoading: isLoadingFilters
  };

  const handleRequestSubtasksBatch = useCallback(async (taskIds: string[]) => {
    // Filter out already processed or currently fetching IDs
    const idsToFetch = taskIds.filter(id => !processedSubTasksRef.current.has(id) && !fetchingSubTasksRef.current.has(id));
    if (idsToFetch.length === 0) return;

    // Mark as fetching
    idsToFetch.forEach(id => {
      fetchingSubTasksRef.current.add(id);
      setLoadingSubTasks(prev => ({ ...prev, [id]: true }));
    });

    try {
      // Chunk IDs to avoid URL length issues and reduce db pressure
      const chunkSize = 10;
      for (let i = 0; i < idsToFetch.length; i += chunkSize) {
        const chunk = idsToFetch.slice(i, i + chunkSize);

        const paramsInit: Record<string, string> = {
          w: workspaceId,
          ids: chunk.join(","),
          vm: "list",
          ps: "10", // 🚀 Reduced initial batch size to trigger cursor-based loading earlier
          ef: "description"
        };

        const params = new URLSearchParams(paramsInit);

        const res = await fetch(`/api/v1/tasks/expansion/batch?${params.toString()}`, {
          cache: "no-store"
        });
        const responseData = await res.json();

        if (responseData.success && Array.isArray(responseData.data)) {
          const updates: Record<string, any> = {};
          responseData.data.forEach((result: any) => {
            const taskId = result.parentTaskId;

            // 🚀 CRITICAL FIX: Merge server tasks with existing local/optimistic tasks
            const currentTask = tasksRef.current.find(t => t.id === taskId);
            const existing = currentTask?.subTasks || [];
            const merged = [...existing, ...(result.subTasks || [])];

            const ordered = orderSubTasksForParent(taskId, merged);
            processedSubTasksRef.current.add(taskId);

            updates[taskId] = {
              subTasks: ordered,
              subTasksHasMore: result.hasMore,
              subTasksNextCursor: result.nextCursor
            };
          });

          setTasks((prev) => prev.map(t => {
            if (updates[t.id]) {
              return { ...t, ...updates[t.id] };
            }
            return t;
          }));

          // 🚀 Incremental Loading: Clear loading state for this chunk immediately
          chunk.forEach(id => {
            fetchingSubTasksRef.current.delete(id);
            setLoadingSubTasks(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          });
        }
      }
    } finally {
      // Emergency cleanup for anything that might have failed (e.g. 500 error on a chunk)
      idsToFetch.forEach(id => {
        if (fetchingSubTasksRef.current.has(id)) {
          fetchingSubTasksRef.current.delete(id);
          setLoadingSubTasks(prev => {
            const n = { ...prev };
            delete n[id];
            return n;
          });
        }
      });
    }
  }, [workspaceId, orderSubTasksForParent]);

  // handleRequestSubtasks (Batched via queue)
  const handleRequestSubtasks = useCallback((taskId: string) => {
    if (processedSubTasksRef.current.has(taskId) || fetchingSubTasksRef.current.has(taskId)) return;

    subTaskBatchQueueRef.current.add(taskId);
    setLoadingSubTasks(prev => ({ ...prev, [taskId]: true }));

    if (subTaskBatchTimeoutRef.current) clearTimeout(subTaskBatchTimeoutRef.current);

    subTaskBatchTimeoutRef.current = setTimeout(() => {
      const queue = Array.from(subTaskBatchQueueRef.current);
      subTaskBatchQueueRef.current.clear();
      if (queue.length > 0) {
        handleRequestSubtasksBatch(queue);
      }
    }, 150); // Small delay to catch multiple expansion requests in one frame
  }, [handleRequestSubtasksBatch]);

  const lastContextIdRef = useRef("");

  // 🚀 Sync state with initial data ONLY when context changes (Mount or New Project)
  useEffect(() => {
    const contextId = `${workspaceId}-${projectId || 'all'}`;
    const isActuallyNewContext = lastContextIdRef.current !== contextId;

    if (initialTasks && isActuallyNewContext) {
      console.log(`[TASK_TABLE] 📦 Initializing context: ${contextId}`);
      setTasks(hydrateTasks(orderRootTasks(initialTasks)));
      lastContextIdRef.current = contextId;

      // 🚀 Reset pagination and processing state
      setProjectPagination({});
      projectPaginationRef.current = {};
      fetchingIdsRef.current.clear();
      processedSubTasksRef.current.clear();
      fetchingSubTasksRef.current.clear();
    }
  }, [workspaceId, projectId, initialTasks, hydrateTasks, orderRootTasks]);

  const lastFiltersActiveRef = useRef(false);

  // Keep tasksRef in sync for batch expansion logic
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    loadingMoreSubTasksRef.current = loadingMoreSubTasks;
  }, [loadingMoreSubTasks]);

  // 🚀 Real-time synchronization is now handled via local state setters
  // mapped from global RealtimeNotificationListener events.
  useEffect(() => {
    const handleSync = (event: any) => {
      const { action, record } = event.detail;

      // Ensure record has necessary fields for TaskWithSubTasks
      const parentTaskId = record.parentTaskId || record.parentId;
      const taskRecord = {
        ...record,
        parentTaskId,
        subTasks: record.isParent ? undefined : (record.subTasks || []),
        isParent: record.isParent ?? !parentTaskId
      } as TaskWithSubTasks;

      switch (action) {
        case "TASK_CREATED":
          // 🚀 Filter by project if we are at project level
          if (level === "project" && projectId && taskRecord.projectId && taskRecord.projectId !== projectId) {
            return;
          }

          const isSubTask = !!taskRecord.parentTaskId;

          if (!isSubTask) {
            // It's a parent task
            setTasks(prev => {
              if (prev.some(t => t.id === taskRecord.id)) return prev;
              return hydrateTasks(orderRootTasks([...prev, taskRecord]));
            });
          } else {
            // It's a subtask
            setTasks(prev => prev.map(t => {
              if (t.id === taskRecord.parentTaskId) {
                const currentSubTasks = t.subTasks || [];
                if (currentSubTasks.some(st => st.id === taskRecord.id)) return t;
                return {
                  ...t,
                  subTasks: orderSubTasksForParent(t.id, [...currentSubTasks, taskRecord]),
                  subtaskCount: (t.subtaskCount || 0) + 1
                };
              }
              return t;
            }));
          }
          break;
        case "TASK_UPDATED":
          // 🚀 ROBUST UPDATE: Find and update the task whether it's a parent or subtask
          setTasks(prev => prev.map(t => {
            // 1. Is it the root task itself?
            if (t.id === taskRecord.id) {
              // Only remove from project view if we are SURE it moved projects
              if (level === "project" && projectId && taskRecord.projectId && taskRecord.projectId !== projectId) {
                return null as any;
              }
              return { ...t, ...taskRecord };
            }

            // 2. Is it a subtask of this parent?
            const hasThisSubTask = t.subTasks?.some(st => st.id === taskRecord.id);
            if (hasThisSubTask) {
              return {
                ...t,
                subTasks: t.subTasks?.map(st => st.id === taskRecord.id ? { ...st, ...taskRecord } : st)
              };
            }

            return t;
          }).filter(Boolean));
          break;
        case "TASK_DELETED":
          setTasks(prev => {
            // 1. Remove from root if it's a parent task
            const filteredRoot = prev.filter(t => t.id !== record.id);

            // 2. Surgically remove from any subtask lists and update counts
            return filteredRoot.map(t => {
              const hasThisSubTask = t.subTasks?.some(st => st.id === record.id);
              if (hasThisSubTask) {
                return {
                  ...t,
                  subTasks: t.subTasks?.filter(st => st.id !== record.id),
                  subtaskCount: Math.max(0, (t.subtaskCount || 0) - 1)
                };
              }
              return t;
            });
          });
          break;
      }
    };

    window.addEventListener("realtime-task-sync", handleSync as any);
    return () => window.removeEventListener("realtime-task-sync", handleSync as any);
  }, [hydrateTasks, orderRootTasks, level, projectId, orderSubTasksForParent]);

  // Auto-expand rows when filters are active OR when isAutoExpanded is toggled.
  // IMPORTANT: When only filtersActive is true, the filtered API response already
  // embeds subtasks inside each parent — do NOT fire additional batch expansion calls.
  // Only fire batch calls when the user explicitly toggled "expand all" (isAutoExpanded).
  useEffect(() => {
    if ((isAutoExpanded || filtersActive) && tasks.length > 0) {
      const newExpanded: Record<string, boolean> = {};
      const idsToFetch: string[] = [];
      let changed = false;

      tasks.forEach(t => {
        if (t.isParent && !expanded[t.id] && !manuallyCollapsedRef.current.has(t.id)) {
          newExpanded[t.id] = true;
          changed = true;

          // Only trigger a batch fetch in "expand all" mode.
          // In filter mode the subtasks are already inline — skip the extra API call.
          if (
            isAutoExpanded &&
            !processedSubTasksRef.current.has(t.id) &&
            !fetchingSubTasksRef.current.has(t.id)
          ) {
            idsToFetch.push(t.id);
          }
        }
      });

      if (changed) {
        setExpanded((prev: Record<string, boolean>) => ({ ...prev, ...newExpanded }));
        if (idsToFetch.length > 0) {
          handleRequestSubtasksBatch(idsToFetch);
        }
      }
    }
  }, [isAutoExpanded, filtersActive, tasks, expanded, handleRequestSubtasksBatch, setExpanded]);

  // Load Project Tasks (Lazy)
  const loadProjectTasks = useCallback(async (targetProjectId: string) => {
    const currentPagination = projectPaginationRef.current[targetProjectId] || { page: 0, nextCursor: undefined, hasMore: true, isLoading: false };
    if (currentPagination.isLoading || !currentPagination.hasMore) return;

    projectPaginationRef.current = { ...projectPaginationRef.current, [targetProjectId]: { ...currentPagination, isLoading: true } };
    setProjectPagination((prev: Record<string, any>) => ({ ...prev, [targetProjectId]: { ...currentPagination, isLoading: true } }));

    const params = new URLSearchParams({ w: workspaceId, vm: "list", hm: "parents", sub: "false", l: "50" });
    if (targetProjectId !== "__global_filter__") params.set("p", targetProjectId);
    if (currentPagination.nextCursor) params.set("c", JSON.stringify(currentPagination.nextCursor));

    // Apply filters to pagination too
    const activeFilters = getActiveFilters(filters);
    activeFilters.forEach(f => {
      if (f.key === "startDate" || f.key === "endDate") {
        params.set(f.key, new Date(f.value).toISOString());
      } else {
        params.set(f.key, String(f.value));
      }
    });
    if (searchQuery) params.set("search", searchQuery);

    const fetchKey = `project-${targetProjectId}-${params.toString()}`;
    if (fetchingIdsRef.current.has(fetchKey)) return;
    fetchingIdsRef.current.add(fetchKey);

    try {
      const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
      const response = await apiRes.json();
      if (response.success) {
        const resultData = response.data;

        setTasks((prev: TaskWithSubTasks[]) => {
          const merged = [...prev, ...resultData.tasks];
          return hydrateTasks(orderRootTasks(merged));
        });

        const nextPaginationEntry = { page: currentPagination.page + 1, nextCursor: resultData.nextCursor, hasMore: resultData.hasMore ?? false, isLoading: false };
        projectPaginationRef.current = { ...projectPaginationRef.current, [targetProjectId]: nextPaginationEntry };
        setProjectPagination((prev) => ({ ...prev, [targetProjectId]: nextPaginationEntry }));
      }
    } finally {
      fetchingIdsRef.current.delete(fetchKey);
    }
  }, [workspaceId, hydrateTasks, orderRootTasks, filters, searchQuery]);

  // 🧹 RESTORE Logic: When filters are cleared, restore the original hierarchical view
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (!filtersActive) {
      if (lastFiltersActiveRef.current) {
        // Clear all expansion states and markers when filters clear
        setIsCurrentlyFiltered(false);
        setIsSubtaskFirstMode(false); // 🚀 FIX: Reset subtask mode on manual clear
        setTasks(hydrateTasksRef.current(dedupeTasks(initialTasks || [])));
        processedSubTasksRef.current = new Set();
        fetchingSubTasksRef.current = new Set();
        setExpanded({});
        setExpandedProjects({});
        lastFiltersActiveRef.current = false;
      }
      return;
    }

    lastFiltersActiveRef.current = true;
  }, [filtersActive, initialTasks]);

  const loadMoreSubTasks = useCallback(async (taskId: string) => {
    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task || !task.subTasks || loadingMoreSubTasksRef.current[taskId]) return;
    setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: true }));

    try {
      const params = new URLSearchParams({
        w: workspaceId,
        p: task.projectId || projectId,
        vm: "list",
        pt: taskId,
        l: "20",
        ef: "description"
      });
      if (task.subTasksNextCursor) params.set("c", JSON.stringify(task.subTasksNextCursor));
      // Apply filters...

      const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
      const response = await apiRes.json();
      if (response.success) {
        const resultData = response.data;

        setTasks((prev) => prev.map(t => {
          if (t.id === taskId) {
            return {
              ...t,
              subTasks: orderSubTasksForParent(taskId, [...(t.subTasks || []), ...resultData.tasks]),
              subTasksHasMore: resultData.hasMore,
              subTasksNextCursor: resultData.nextCursor
            };
          }
          return t;
        }));
      }
    } finally {
      setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: false }));
    }
  }, [workspaceId, projectId, orderSubTasksForParent]);

  const loadMoreSorted = async () => {
    if (!sortedHasMore || isLoadingMoreSorted) return;
    setIsLoadingMoreSorted(true);
    try {
      const params = new URLSearchParams({ w: workspaceId, vm: "list", onlySub: "true", l: "20", ef: "description" });
      if (projectId) params.set("p", projectId);
      if (sortedNextCursor) params.set("c", JSON.stringify(sortedNextCursor));
      if (sorts.length > 0) params.set("sorts", JSON.stringify(sorts));

      const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
      const res = await apiRes.json();
      if (res.success) {
        setSortedTasks((prev) => [...prev, ...res.data.tasks]);
        setSortedHasMore(res.data.hasMore);
        setSortedNextCursor(res.data.nextCursor);
      }
    } finally {
      setIsLoadingMoreSorted(false);
    }
  };

  // Initial fetch for sorted view
  useEffect(() => {
    if (sorts.length === 0) {
      setSortedTasks([]);
      setSortedHasMore(false);
      return;
    }
    const fetchSorted = async () => {
      setIsSortedViewLoading(true);
      try {
        const params = new URLSearchParams({ w: workspaceId, vm: "list", onlySub: "true", l: "20", ef: "description" });
        if (projectId) params.set("p", projectId);
        if (sorts.length > 0) params.set("sorts", JSON.stringify(sorts));
        const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
        const res = await apiRes.json();
        if (res.success) {
          setSortedTasks(res.data.tasks || []);
          setSortedHasMore(res.data.hasMore);
          setSortedNextCursor(res.data.nextCursor);
        }
      } finally {
        setIsSortedViewLoading(false);
      }
    };
    fetchSorted();
  }, [sorts, workspaceId, projectId]);

  // toggleExpand
  const toggleExpand = useCallback((taskId: string) => {
    let shouldFetch = false;

    setExpanded((prev: Record<string, boolean>) => {
      const isExpanding = !prev[taskId];
      if (isExpanding) {
        manuallyCollapsedRef.current.delete(taskId);
        const hasNotProcessed = !processedSubTasksRef.current.has(taskId);
        if (hasNotProcessed) shouldFetch = true;
      } else {
        manuallyCollapsedRef.current.add(taskId);
      }
      return { ...prev, [taskId]: isExpanding };
    });

    if (shouldFetch) {
      const t = tasksRef.current.find((x) => x.id === taskId);
      if (t && (filtersActive || t.subtaskCount > 0)) {
        handleRequestSubtasks(taskId);
      }
    }
  }, [handleRequestSubtasks, filtersActive, setExpanded]);


  // handleSort
  const handleSort = (field: SortField) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.field === field);
      if (!existing) return [{ field, direction: "asc" as const }];
      if (existing.direction === "asc") return [{ field, direction: "desc" as const }];
      return [];
    });
  };

  const toggleProjectExpand = (targetProjectId: string) => {
    setExpandedProjects((prev) => ({ ...prev, [targetProjectId]: !prev[targetProjectId] }));
    if (!expandedProjects[targetProjectId]) {
      if (tasks.filter(t => t.projectId === targetProjectId).length === 0) loadProjectTasks(targetProjectId);
    }
  };

  // 🚀 INSTANT OPEN: Use partial data from the list immediately, fetch full data in background
  const handleSubTaskClick = useCallback((subTask: SubTaskType) => {
    const slug = (subTask as any).taskSlug || subTask.id;

    // 1. IMMEDIATELY open the sheet with whatever data we have (shows skeleton for missing fields)
    openSubTaskSheet(subTask as any);

    // 2. Fetch the full task data in the background to hydrate the sheet
    if (workspaceId && slug) {
      apiClient.tasks.getTaskBySlug(workspaceId, slug).then(result => {
        if (result.success && result.data) {
          openSubTaskSheet(result.data);
        }
      }).catch(() => {/* silently fail, partial data is still shown */ });
    }
  }, [openSubTaskSheet, workspaceId]);

  const handleSubTaskUpdated = useCallback((subTaskId: string, updatedData: any) => {
    setTasks(prev => prev.map(t => {
      if (t.subTasks) {
        return {
          ...t,
          subTasks: t.subTasks.map(st => st.id === subTaskId ? { ...st, ...updatedData } : st)
        };
      }
      return t;
    }));
  }, []);

  return {
    tasks, setTasks,
    tags, filters, setFilters, searchQuery, setSearchQuery, clearFilters,
    isLoadingFilters, isCurrentlyFiltered,
    expanded, setExpanded,
    loadingSubTasks, setLoadingSubTasks,
    loadingMoreSubTasks, setLoadingMoreSubTasks,
    updatingTaskId, setUpdatingTaskId,
    expandedProjects, setExpandedProjects,
    sorts, setSorts,
    sortedTasks, sortedHasMore, isSortedViewLoading, isLoadingMoreSorted,
    isSubtaskFirstMode,
    filtersActive,
    currentProjectCounts: projectCounts,
    activeInlineProjectId: activeInlineProjectIdState,
    setActiveInlineProjectId: setActiveInlineProjectIdState,

    handleSort,
    toggleProjectExpand,
    loadProjectTasks,
    hydrateTasks,
    normalizeFilteredTasks,
    orderSubTasksForParent,
    projectPagination,
    handleRequestSubtasks,
    toggleExpand,
    handleSubTaskClick,
    handleSubTaskUpdated,
    loadMoreSubTasks,
    loadMoreSorted,
    loadMoreFiltered,
    filterPagination,
    handleExpandAll: () => {
      manuallyCollapsedRef.current.clear();
      setIsAutoExpanded(true);
      // Expand all projects
      setExpandedProjects(projects.reduce((a: any, p: any) => ({ ...a, [p.id]: true }), {}));

      const newExpanded: Record<string, boolean> = {};
      const idsToFetch: string[] = [];

      tasks.forEach((t) => {
        if (t.isParent) {
          newExpanded[t.id] = true;
          if (!processedSubTasksRef.current.has(t.id) && !fetchingSubTasksRef.current.has(t.id)) {
            idsToFetch.push(t.id);
          }
        } else if (isSubtaskFirstMode && t.parentTaskId) {
          // In subtask-first mode, expand the parent of the matched subtask
          newExpanded[t.parentTaskId] = true;
        }
      });

      setExpanded((prev: Record<string, boolean>) => ({ ...prev, ...newExpanded }));
      if (idsToFetch.length > 0) {
        handleRequestSubtasksBatch(idsToFetch);
      }
    },
    handleCollapseAll: () => {
      manuallyCollapsedRef.current.clear();
      setIsAutoExpanded(false);

      // If filters are active, we need to explicitly set all current parent tasks and projects to false 
      // because the UI defaults to 'true' if the ID is missing from the state.
      if (isSubtaskFirstMode) {
        const collapsedState: Record<string, boolean> = {};
        const collapsedProjects: Record<string, boolean> = {};

        tasks.forEach(t => {
          if (t.parentTaskId) collapsedState[t.parentTaskId] = false;
        });
        projects.forEach((p: any) => {
          collapsedProjects[p.id] = false;
        });

        setExpanded(collapsedState);
        setExpandedProjects(collapsedProjects);
      } else {
        setExpanded({});
        setExpandedProjects({});
      }
    }
  };
}
