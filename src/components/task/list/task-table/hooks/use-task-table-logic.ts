"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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
import { useProjectLayout } from "@/app/w/[workspaceId]/p/[slug]/_components/project-layout-context";

export function useTaskTableLogic({
  initialTasks,
  workspaceId,
  projectId,
  level,
  projectCounts,
  projects,
}: any) {
  const contextId = `${workspaceId}-${projectId || 'all'}`;
  const searchParams = useSearchParams();

  // Local helper for robust deduplication by ID
  const dedupeTasks = (taskList: TaskWithSubTasks[]) => {
    if (!taskList) return [];
    return taskList.filter((t, i, a) => a.findIndex(c => c.id === t.id) === i);
  };

  // Initialize state directly from initialTasks (no global cache)
  const [tasks, setTasks] = useState<TaskWithSubTasks[]>(() => dedupeTasks(initialTasks || []));

  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [searchQuery, setSearchQuery] = useState("");
  const clearFilters = useCallback(() => {
    setFilters({});
    setSearchQuery("");
  }, []);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isCurrentlyFiltered, setIsCurrentlyFiltered] = useState(false);

  // 🚀 Persistent State Sync: Try to use ProjectLayoutContext if available
  let projectCtx: any = null;
  try { projectCtx = useProjectLayout(); } catch (e) { }

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

  const filtersActive = hasActiveFilters(filters) || !!searchQuery;
  const tasksRef = useRef<TaskWithSubTasks[]>([]);
  const fetchingIdsRef = useRef<Set<string>>(new Set());
  const isInitialMountRef = useRef<boolean>(true);
  const projectPaginationRef = useRef<Record<string, any>>({});
  const processedSubTasksRef = useRef<Set<string>>(new Set());
  const fetchingSubTasksRef = useRef<Set<string>>(new Set());
  const subTaskBatchQueueRef = useRef<Set<string>>(new Set());
  const subTaskBatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoExpanded, setIsAutoExpanded] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

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

        const res = await fetch(`/api/v1/tasks/expansion/batch?${params.toString()}`);
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

      // 🚀 FORCE RE-OBSERVE: Disconnect and null out observer so it re-attaches
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    }
  }, [workspaceId, projectId, initialTasks, hydrateTasks, orderRootTasks]);

  // 🚀 Handle filter clearing separately to avoid using stale initialTasks
  useEffect(() => {
    if (!filtersActive && lastContextIdRef.current) {
      // If we are clearing filters, we might want to re-fetch or just stay with current surgical state.
      // For now, we trust surgical sync + background revalidation to keep us correct.
      // We explicitly DO NOT overwrite with initialTasks here to avoid re-appearance bugs.
    }
  }, [filtersActive]);

  // Keep tasksRef in sync for batch expansion logic
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // 🚀 Real-time synchronization is now handled via local state setters
  // mapped from global RealtimeNotificationListener events.
  useEffect(() => {
    const handleSync = (event: any) => {
      const { action, record, isActor } = event.detail;

      // Ensure record has necessary fields for TaskWithSubTasks
      const parentTaskId = record.parentTaskId || record.parentId;
      const taskRecord = {
        ...record,
        parentTaskId,
        subTasks: record.subTasks || [],
        isParent: !parentTaskId
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
  }, [hydrateTasks, orderRootTasks]);
  // Expansion Lock Removal (on filter change)
  useEffect(() => {
    processedSubTasksRef.current.clear();
    fetchingSubTasksRef.current.clear();
    // Don't clear isAutoExpanded here, keep the mode active if user wants it
  }, [filters, searchQuery]);

  // Auto-expand newly loaded tasks if isAutoExpanded is true OR if we are filtering
  useEffect(() => {
    if ((isAutoExpanded || filtersActive) && tasks.length > 0) {
      const newExpanded: Record<string, boolean> = {};
      const idsToFetch: string[] = [];
      let changed = false;

      tasks.forEach(t => {
        if (t.isParent && !expanded[t.id]) {
          newExpanded[t.id] = true;
          changed = true;
          if (!processedSubTasksRef.current.has(t.id) && !fetchingSubTasksRef.current.has(t.id)) {
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
  }, [isAutoExpanded, filtersActive, tasks, expanded, handleRequestSubtasksBatch]);

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
  }, [workspaceId, filtersActive, hydrateTasks, normalizeFilteredTasks, orderRootTasks]);

  const hydrateTasksRef = useRef(hydrateTasks);
  const normalizeFilteredTasksRef = useRef(normalizeFilteredTasks);
  const orderRootTasksRef = useRef(orderRootTasks);

  useEffect(() => {
    hydrateTasksRef.current = hydrateTasks;
    normalizeFilteredTasksRef.current = normalizeFilteredTasks;
    orderRootTasksRef.current = orderRootTasks;
  }, [hydrateTasks, normalizeFilteredTasks, orderRootTasks]);

  // Fetch Filtered (Applied with debounce)
  const fetchFiltered = useCallback(async (isAbortedRef: { current: boolean }) => {
    setIsLoadingFilters(true);
    setIsCurrentlyFiltered(true);
    try {
      const params = new URLSearchParams({
        w: workspaceId,
        vm: "list",
        l: "50",
        facets: "true",
        ef: "description" // Include description for filtered results (especially subtasks)
      });
      if (level === "project" && projectId) params.set("p", projectId);

      // Apply active filters
      const activeFilters = getActiveFilters(filters);
      activeFilters.forEach(f => {
        if (f.key === "startDate" || f.key === "endDate") {
          params.set(f.key, new Date(f.value).toISOString());
        } else {
          params.set(f.key, String(f.value));
        }
      });
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/v1/tasks?${params.toString()}`);
      const response = await res.json();
      if (!isAbortedRef.current && response.success) {
        setTasks(hydrateTasksRef.current(orderRootTasksRef.current(response.data.tasks)));

        if (response.data.facets?.projects) {
          // You could also store facets in the store if needed
        }
      }
    } finally {
      if (!isAbortedRef.current) setIsLoadingFilters(false);
    }
  }, [workspaceId, projectId, level, filters, searchQuery]);

  // Effect to trigger filtering
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      // Fetch tags on mount
      const fetchTags = async () => {
        try {
          const res = await fetch(`/api/v1/workspace-tags?workspaceId=${workspaceId}`);
          const data = await res.json();
          if (data.success) setTags(data.tags);
        } catch (e) { }
      };
      fetchTags();
      return;
    }

    const abortRef = { current: false };
    const timeout = setTimeout(() => {
      if (filtersActive) {
        fetchFiltered(abortRef);
      } else if (isCurrentlyFiltered) {
        // Reset to initial state
        setIsCurrentlyFiltered(false);
      }
    }, 300);

    return () => {
      abortRef.current = true;
      clearTimeout(timeout);
    };
  }, [filters, searchQuery, fetchFiltered, filtersActive, isCurrentlyFiltered]); // Removed unstable/prop dependencies


  const loadMoreSubTasks = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !task.subTasks || loadingMoreSubTasks[taskId]) return;
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
  };

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
        const hasNotProcessed = !processedSubTasksRef.current.has(taskId);
        if (hasNotProcessed) shouldFetch = true;
      }
      return { ...prev, [taskId]: isExpanding };
    });

    if (shouldFetch) {
      const t = tasksRef.current.find((x) => x.id === taskId);
      if (t && (filtersActive || t.subtaskCount > 0)) {
        handleRequestSubtasks(taskId);
      }
    }
  }, [handleRequestSubtasks, filtersActive]);

  // Intersection Observer
  const getObserver = useCallback(() => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const pId = (e.target as HTMLElement).dataset.projectId;
            if (pId) loadProjectTasks(pId);
          }
        });
      }, { rootMargin: "200px" });
    }
    return observerRef.current;
  }, [loadProjectTasks]);

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
    tags, setTags, filters, setFilters, searchQuery, setSearchQuery, clearFilters,
    isLoadingFilters, isCurrentlyFiltered,
    expanded, setExpanded,
    loadingSubTasks, setLoadingSubTasks,
    loadingMoreSubTasks, setLoadingMoreSubTasks,
    updatingTaskId, setUpdatingTaskId,
    expandedProjects, setExpandedProjects,
    sorts, setSorts,
    sortedTasks, sortedHasMore, isSortedViewLoading, isLoadingMoreSorted,
    filtersActive,
    currentProjectCounts: projectCounts,
    activeInlineProjectId: activeInlineProjectIdState,
    setActiveInlineProjectId: setActiveInlineProjectIdState,
    scrollContainerRef,
    handleSort,
    toggleProjectExpand,
    loadProjectTasks,
    hydrateTasks,
    normalizeFilteredTasks,
    orderSubTasksForParent,
    projectPagination,
    handleRequestSubtasks,
    toggleExpand,
    getObserver,
    handleSubTaskClick,
    handleSubTaskUpdated,
    loadMoreSubTasks,
    loadMoreSorted,
    handleExpandAll: () => {
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
        }
      });

      setExpanded((prev: Record<string, boolean>) => ({ ...prev, ...newExpanded }));
      if (idsToFetch.length > 0) {
        handleRequestSubtasksBatch(idsToFetch);
      }
    },
    handleCollapseAll: () => {
      setIsAutoExpanded(false);
      setExpanded({});
      setExpandedProjects({});
    }
  };
}
