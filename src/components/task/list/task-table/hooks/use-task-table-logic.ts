"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { useFilterStore } from "@/lib/store/filter-store";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { 
  type TaskWithSubTasks, 
  type SortConfig, 
  type SortField, 
  hasActiveFilters,
  getActiveFilters
} from "@/components/task/shared/types";
import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";
import type { SubTaskType } from "@/data/task";

export function useTaskTableLogic({
  initialTasks,
  initialHasMore,
  initialNextCursor,
  initialTotalCount,
  workspaceId,
  projectId,
  level,
  projectCounts,
  projects,
  isShell = false,
}: any) {
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const { filters, setFilters, searchQuery, setSearchQuery, clearFilters } = useFilterStore();
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isCurrentlyFiltered, setIsCurrentlyFiltered] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
  const [currentProjectCounts, setCurrentProjectCounts] = useState<Record<string, number> | undefined>(projectCounts);
  const [activeInlineProjectId, setActiveInlineProjectId] = useState<string | null>(null);
  const [projectPagination, setProjectPagination] = useState<Record<string, any>>({});

  const filtersActive = hasActiveFilters(filters) || !!searchQuery;
  const tasksRef = useRef<TaskWithSubTasks[]>([]);
  const fetchingIdsRef = useRef<Set<string>>(new Set());
  const hasFetchedRef = useRef(false);
  const isInitialMountRef = useRef<boolean>(true);
  const projectPaginationRef = useRef<Record<string, any>>({});
  const processedSubTasksRef = useRef<Set<string>>(new Set());
  const fetchingSubTasksRef = useRef<Set<string>>(new Set());
  const autoExpandRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const getCachedSubTasks = useTaskCacheStore((state) => state.getCachedSubTasks);
  const setCachedSubTasks = useTaskCacheStore((state) => state.setCachedSubTasks);
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

  const compareSubTasksFallback = useCallback(
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
        return compareSubTasksFallback(a, b);
      });
    }
    return deduped.sort(compareSubTasksFallback);
  }, [sorts, compareByField, compareSubTasksFallback]);

  // Order Root Tasks
  const orderRootTasks = useCallback((taskList: TaskWithSubTasks[]) => {
    const deduped = taskList.filter((t, i, a) => a.findIndex(c => c.id === t.id) === i);
    const projectRank = new Map();
    projects.forEach((p: any, i: number) => projectRank.set(p.id, i));

    return deduped.sort((a, b) => {
      const aPR = projectRank.get(a.projectId || "") ?? 9999;
      const bPR = projectRank.get(b.projectId || "") ?? 9999;
      if (aPR !== bPR) return aPR - bPR;
      return compareByCreatedAtAsc(a, b);
    });
  }, [projects, compareByCreatedAtAsc]);

  const normalizeFilteredTasks = useCallback((taskList: TaskWithSubTasks[]) => 
    orderRootTasks(taskList.map((t) => ({
      ...t,
      subTasks: t.subTasks ? orderSubTasksForParent(t.id, t.subTasks) : t.subTasks,
    }))), [orderRootTasks, orderSubTasksForParent]);

  // Hydrate
  const hydrateTasks = useCallback((taskList: TaskWithSubTasks[], debugLabel?: string, options?: { skipMemorySubtasks?: boolean }) => {
    const state = useTaskCacheStore.getState();
    return taskList.map((t) => {
      const cachedEntity = state.entities[t.id];
      let currentT = t;
      if (cachedEntity) {
        const incomingTime = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
        const cachedTime = cachedEntity.updatedAt ? new Date(cachedEntity.updatedAt).getTime() : 0;
        const merged = cachedTime > incomingTime ? { ...t, ...cachedEntity } : { ...cachedEntity, ...t };
        currentT = {
          ...merged,
          updatedAt: merged.updatedAt ? new Date(merged.updatedAt) : undefined,
        } as TaskWithSubTasks;
      }
      if (currentT.subTasks !== undefined && debugLabel !== "realtime-sync") return currentT;
      const cached = state.getCachedSubTasks(currentT.id);
      if (cached && (debugLabel === "realtime-sync" || currentT.subTasks === undefined)) {
        return { ...currentT, subTasks: cached.subTasks, subTasksHasMore: cached.hasMore, subTasksNextCursor: cached.nextCursor };
      }
      return currentT;
    });
  }, []);

  const [tasks, setTasks] = useState<TaskWithSubTasks[]>(() => hydrateTasks(orderRootTasks(initialTasks)));

  // Real-time Sync (Store hydration)
  useEffect(() => {
    const unsub = useTaskCacheStore.subscribe(() => {
      setTasks((prev) => hydrateTasks(prev, "realtime-sync"));
    });
    return unsub;
  }, [hydrateTasks]);

  // Real-time Sync (Structural changes via realtime-sync-refresh)
  // Same pattern as AttendanceTable, LeavesTable, and TeamManagementClient
  useEffect(() => {
    const handler = (e: any) => {
      const { action, record, oldRecord } = e.detail || {};

      console.log(`[TaskTable][SURGICAL_V2] 🔄 Event received: ${action}`, {
        id: record?.id,
        projectId: record?.projectId,
      });

      // 1. Handle New Tasks (Parent task created)
      if (record && action === "TASK_CREATED") {
        // Only inject if relevant to current view
        const isRelevant =
          level === "workspace" ||
          record.projectId === projectId;
        if (!isRelevant) return;

        setTasks((prev) => {
          if (prev.some((t) => t.id === record.id)) return prev;
          const newTask = {
            ...record,
            subTasks: record.subTasks || undefined,
            subtaskCount: record.subtaskCount ?? record._count?.subTasks ?? 0,
            isParent: record.isParent ?? true,
          } as TaskWithSubTasks;
          return orderRootTasks([newTask, ...prev]);
        });
        return;
      }

      // 2. Handle Subtask Created
      if (record && action === "SUBTASK_CREATED" && record.parentTaskId) {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== record.parentTaskId) return t;
            const currentSubTasks = t.subTasks || [];
            if (currentSubTasks.some((st) => st.id === record.id)) return t;
            return {
              ...t,
              subTasks: [record, ...currentSubTasks],
              subtaskCount: (t.subtaskCount || 0) + 1,
            };
          })
        );
        return;
      }

      // 3. Handle Task Updates
      if (record && (action === "TASK_UPDATED" || action === "SUBTASK_UPDATED")) {
        setTasks((prev) =>
          prev.map((t) => {
            // Direct task update
            if (t.id === record.id) {
              return { ...t, ...record };
            }
            // Subtask update within a parent
            if (t.subTasks?.some((st) => st.id === record.id)) {
              return {
                ...t,
                subTasks: t.subTasks.map((st) =>
                  st.id === record.id ? { ...st, ...record } : st
                ),
              };
            }
            return t;
          })
        );
        return;
      }

      // 4. Handle Task Deleted
      if (action === "TASK_DELETED") {
        const deletedId = record?.id || oldRecord?.id;
        if (deletedId) {
          setTasks((prev) => prev.filter((t) => t.id !== deletedId));
          return;
        }
      }

      // 5. Handle Subtask Deleted
      if (action === "SUBTASK_DELETED") {
        const deletedId = record?.id || oldRecord?.id;
        const parentId = record?.parentTaskId || oldRecord?.parentTaskId;
        if (deletedId) {
          setTasks((prev) =>
            prev.map((t) => {
              if (t.id !== parentId && !t.subTasks?.some((st) => st.id === deletedId)) return t;
              return {
                ...t,
                subTasks: t.subTasks?.filter((st) => st.id !== deletedId),
                subtaskCount: Math.max(0, (t.subtaskCount || 0) - 1),
              };
            })
          );
          return;
        }
      }

      // ⛔ BLOCK Fallback for all known task actions to prevent unnecessary fetch
      if (action?.startsWith("TASK_") || action?.startsWith("SUBTASK_")) {
        console.log(`[TaskTable] ✅ Surgical update complete for ${action}. No fetch required.`);
        return;
      }
    };

    window.addEventListener("realtime-sync-refresh", handler);
    return () => window.removeEventListener("realtime-sync-refresh", handler);
  }, [workspaceId, projectId, level, orderRootTasks]);

  // Expansion Lock Removal (on filter change)
  useEffect(() => {
    processedSubTasksRef.current.clear();
    fetchingSubTasksRef.current.clear();
  }, [filters, searchQuery]);

  // Load Project Tasks (Lazy)
  const loadProjectTasks = useCallback(async (targetProjectId: string) => {
    const currentPagination = projectPaginationRef.current[targetProjectId] || { page: 0, nextCursor: undefined, hasMore: true, isLoading: false };
    if (currentPagination.isLoading || !currentPagination.hasMore) return;

    projectPaginationRef.current = { ...projectPaginationRef.current, [targetProjectId]: { ...currentPagination, isLoading: true } };
    setProjectPagination((prev) => ({ ...prev, [targetProjectId]: { ...currentPagination, isLoading: true } }));

    const params = new URLSearchParams({ w: workspaceId, vm: "list", hm: "parents", sub: "false", l: "50", ef: "description" });
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
        setTasks((prev) => {
          const merged = filtersActive ? normalizeFilteredTasks([...prev, ...resultData.tasks]) : orderRootTasks([...prev, ...resultData.tasks]);
          return hydrateTasks(merged);
        });
        const nextPaginationEntry = { page: currentPagination.page + 1, nextCursor: resultData.nextCursor, hasMore: resultData.hasMore ?? false, isLoading: false };
        projectPaginationRef.current = { ...projectPaginationRef.current, [targetProjectId]: nextPaginationEntry };
        setProjectPagination((prev) => ({ ...prev, [targetProjectId]: nextPaginationEntry }));
      }
    } finally {
      fetchingIdsRef.current.delete(fetchKey);
    }
  }, [workspaceId, filtersActive, hydrateTasks, normalizeFilteredTasks, orderRootTasks]);

  // Fetch Filtered (Applied with debounce)
  const fetchFiltered = useCallback(async (isAbortedRef: { current: boolean }) => {
    setIsLoadingFilters(true);
    setIsCurrentlyFiltered(true);
    try {
      const params = new URLSearchParams({ w: workspaceId, vm: "list", l: "50", facets: "true", ef: "description" });
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
        setTasks(hydrateTasks(normalizeFilteredTasks(response.data.tasks)));
        if (response.data.facets?.projects) setCurrentProjectCounts(response.data.facets.projects);
      }
    } finally {
      if (!isAbortedRef.current) setIsLoadingFilters(false);
    }
  }, [workspaceId, projectId, level, hydrateTasks, normalizeFilteredTasks, filters, searchQuery]);

  // Effect to trigger filtering
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      // Fetch tags on mount
      const fetchTags = async () => {
        try {
          const res = await fetch(`/api/v1/tags?workspaceId=${workspaceId}`);
          const data = await res.json();
          if (data.success) setTags(data.tags);
        } catch (e) {}
      };
      fetchTags();
      return;
    }

    const abortRef = { current: false };
    const timeout = setTimeout(() => {
      if (filtersActive) {
        fetchFiltered(abortRef);
      } else if (isCurrentlyFiltered) {
        // Reset to initial state if filters cleared
        setTasks(hydrateTasks(orderRootTasks(initialTasks)));
        setIsCurrentlyFiltered(false);
        setCurrentProjectCounts(projectCounts);
      }
    }, 300);

    return () => {
      abortRef.current = true;
      clearTimeout(timeout);
    };
  }, [filters, searchQuery, fetchFiltered, filtersActive, isCurrentlyFiltered, initialTasks, hydrateTasks, orderRootTasks, projectCounts, workspaceId]);

  // handleRequestSubtasks
  const handleRequestSubtasks = useCallback(async (taskId: string) => {
    if (processedSubTasksRef.current.has(taskId) || fetchingSubTasksRef.current.has(taskId)) return;

    fetchingSubTasksRef.current.add(taskId);
    setLoadingSubTasks((prev) => ({ ...prev, [taskId]: true }));

    try {
      const params = new URLSearchParams({ w: workspaceId, ids: taskId, vm: "list", ps: "30", ef: "description" });
      const res = await fetch(`/api/v1/tasks/expansion/batch?${params.toString()}`);
      const responseData = await res.json();
      if (responseData.success && responseData.data?.[0]) {
        const result = responseData.data[0];
        const ordered = orderSubTasksForParent(taskId, result.subTasks || []);
        processedSubTasksRef.current.add(taskId);
        setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, subTasks: ordered, subTasksHasMore: result.hasMore, subTasksNextCursor: result.nextCursor } : t));
      }
    } finally {
      fetchingSubTasksRef.current.delete(taskId);
      setLoadingSubTasks((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
    }
  }, [workspaceId, orderSubTasksForParent]);

  const loadMoreSubTasks = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !task.subTasks || loadingMoreSubTasks[taskId]) return;
    setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: true }));

    try {
      const params = new URLSearchParams({ 
        w: workspaceId, p: task.projectId || projectId, vm: "list", pt: taskId, l: "50" 
      });
      if (task.subTasksNextCursor) params.set("c", JSON.stringify(task.subTasksNextCursor));
      // Apply filters...

      const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
      const response = await apiRes.json();
      if (response.success) {
        const resultData = response.data;
        const combined = orderSubTasksForParent(taskId, [...task.subTasks, ...resultData.tasks], task.subTasks);
        if (!filtersActive) setCachedSubTasks(taskId, { subTasks: combined, hasMore: resultData.hasMore, nextCursor: resultData.nextCursor });
        setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, subTasks: combined, subTasksHasMore: resultData.hasMore, subTasksNextCursor: resultData.nextCursor } : t));
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
    setExpanded((prev) => {
      const isExpanding = !prev[taskId];
      if (isExpanding) {
        const t = tasksRef.current.find((x) => x.id === taskId);
        if (t && (t.subTasks === undefined || t.subTasks.length === 0) && (filtersActive || t.subtaskCount > 0)) {
          handleRequestSubtasks(taskId);
        }
      }
      return { ...prev, [taskId]: isExpanding };
    });
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

  const handleSubTaskClick = (subTask: SubTaskType) => { openSubTaskSheet(subTask); };

  const handleOptimisticSubTaskUpdated = useCallback((subTaskId: string, updatedData: any) => {
    setTasks((prev) => prev.map(t => {
      if (!t.subTasks?.some(st => st.id === subTaskId)) return t;
      return { ...t, subTasks: t.subTasks.map(st => st.id === subTaskId ? { ...st, ...updatedData } : st) };
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
    currentProjectCounts,
    filtersActive,
    activeInlineProjectId, setActiveInlineProjectId,
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
    handleOptimisticSubTaskUpdated,
    loadMoreSubTasks,
    loadMoreSorted,
    handleExpandAll: () => {
      // Expand all projects
      setExpandedProjects(projects.reduce((a: any, p: any) => ({ ...a, [p.id]: true }), {}));
      
      // Expand all currently visible tasks and trigger subtask fetches if needed
      setExpanded((prev) => {
        const next = { ...prev };
        tasks.forEach((t) => {
          if (t.isParent) {
            next[t.id] = true;
            if (t.subTasks === undefined && t.subtaskCount > 0) {
              handleRequestSubtasks(t.id);
            }
          }
        });
        return next;
      });
    },
    handleCollapseAll: () => {
      setExpanded({});
      setExpandedProjects({});
    }
  };
}
