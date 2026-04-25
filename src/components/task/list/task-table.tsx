"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
} from "react";
import { Loader2, ChevronsUpDown, Maximize2, Minimize2 } from "lucide-react";
import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";
// Simple debounce implementation
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
import type { ProjectMembersType } from "@/data/project/get-project-members";
import type { SubTaskType } from "@/data/task";
import {
  type TaskWithSubTasks,
  type SortConfig,
  type SortField,
  hasActiveFilters,
  getActiveFilters,
} from "@/components/task/shared/types";
import { GlobalFilterToolbar } from "../shared/global-filter-toolbar";
import { ColumnVisibility } from "../shared/column-visibility";
import { extractAllFilterOptions } from "@/lib/utils/extract-filter-options";
import { SortableHeader } from "./sort/sortable-header";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { useFilterStore } from "@/lib/store/filter-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { TableLoading } from "./table/table-loading";
import { LoadMoreSentinel } from "./table/load-more-sentinel";
import { ProjectTaskGroup } from "./group/project-task-group";
import { FlatTaskList } from "./group/flat-task-list";
import { EmptyState } from "./table/empty-state";
import { SortedTaskList } from "./sort/sorted-task-list";


interface TaskTableProps {
  initialTasks: TaskWithSubTasks[];
  initialHasMore: boolean;
  initialNextCursor?: any;
  initialTotalCount?: number;
  members: ProjectMembersType;
  assignees?: Array<{ id: string; name: string; surname?: string }>;
  workspaceId: string;
  projectId: string;
  canCreateSubTask: boolean;
  showAdvancedFilters?: boolean;
  tags?: { id: string; name: string }[];
  projects?: {
    id: string;
    name: string;
    canManageMembers?: boolean;
    color?: string;
    managedProjectIds?: string[];
  }[];
  leadProjectIds?: string[];
  isWorkspaceAdmin?: boolean;
  level?: "workspace" | "project";
  permissions?: UserPermissionsType;
  userId?: string;
  projectCounts?: Record<string, number>;
  isShell?: boolean;
}

const DEFAULT_TAGS: { id: string; name: string }[] = [];
const DEFAULT_PROJECTS: { id: string; name: string }[] = [];

function TaskTable({
  initialTasks,
  members,
  assignees,
  workspaceId,
  projectId,
  canCreateSubTask,
  showAdvancedFilters = false,
  tags = DEFAULT_TAGS,
  projects = DEFAULT_PROJECTS,
  leadProjectIds = [],
  isWorkspaceAdmin = false,
  level = "project",
  permissions,
  userId,
  initialHasMore,
  initialNextCursor,
  initialTotalCount,
  projectCounts,
  isShell = false,
}: TaskTableProps) {
  const { filters, setFilters, searchQuery, setSearchQuery, clearFilters } =
    useFilterStore();
  const debouncedSetFilters = useCallback(debounce(setFilters, 200), [
    setFilters,
  ]);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isCurrentlyFiltered, setIsCurrentlyFiltered] = useState(false);
  const filtersActive = hasActiveFilters(filters) || !!searchQuery;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingSubTasks, setLoadingSubTasks] = useState<
    Record<string, boolean>
  >({});
  const [loadingMoreSubTasks, setLoadingMoreSubTasks] = useState<
    Record<string, boolean>
  >({});
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});
  const [sorts, setSorts] = useState<SortConfig[]>([]);
  const [sortedTasks, setSortedTasks] = useState<any[]>([]);
  const [sortedHasMore, setSortedHasMore] = useState(false);
  const [sortedNextCursor, setSortedNextCursor] = useState<any>(null);
  const [isLoadingMoreSorted, setIsLoadingMoreSorted] = useState(false);
  const [isSortedViewLoading, setIsSortedViewLoading] = useState(false);
  const [currentProjectCounts, setCurrentProjectCounts] = useState<
    Record<string, number> | undefined
  >(projectCounts);
  const setCachedSubTasks = useTaskCacheStore(
    (state) => state.setCachedSubTasks,
  );
  const getCachedSubTasks = useTaskCacheStore(
    (state) => state.getCachedSubTasks,
  );
  const setProjectTasksCache = useTaskCacheStore(
    (state) => state.setProjectTasksCache,
  );

  const projectMap = useMemo(() => {
    const map: Record<string, any> = {};
    projects?.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [projects]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tasksRef = useRef<TaskWithSubTasks[]>([]);
  const loadMoreSortedRef = useRef<(() => Promise<void>) | null>(null);
  const loadProjectTasksRef = useRef<((id: string) => Promise<void>) | null>(
    null,
  );
  const autoExpandRef = useRef(false);
  const processedSubTasksRef = useRef<Set<string>>(new Set());
  const fetchingSubTasksRef = useRef<Set<string>>(new Set());
  const fetchingIdsRef = useRef<Set<string>>(new Set()); // Lock for parent/project fetches
  const isInitialMountRef = useRef<boolean>(true);
  const hasFetchedRef = useRef(false);
  const filteredProjectQueueRunningRef = useRef(false);
  // ✅ DUP-FIX: Always-current ref so loadProjectTasks never reads a stale pagination closure
  const projectPaginationRef = useRef<Record<string, { page: number; nextCursor: any; hasMore: boolean; isLoading: boolean }>>({});

  const hydrateTasks = useCallback(
    (
      taskList: TaskWithSubTasks[],
      debugLabel?: string,
      options?: { skipMemorySubtasks?: boolean },
    ) => {
      // 1. First, try to merge from what we already have in memory (essential for preservation during filters)
      const currentTasks = tasksRef.current;
      const memoryMap = new Map<string, TaskWithSubTasks>();
      currentTasks.forEach((t) => {
        if (t.subTasks !== undefined) memoryMap.set(t.id, t);
      });

      // 2. Fallback to global zustand cache
      const getCache = useTaskCacheStore.getState().getCachedSubTasks;

      const result = taskList.map((t) => {
        // If it already has subtasks (from a fresh server result if that ever happens), keep them
        if (t.subTasks !== undefined) return t;

        // ✅ Bug 2 Fix: Skip memory + global cache entirely when filters are active.
        // Hydrating stale unfiltered subtasks here would overwrite fresh filtered results
        // and feed Bug 3 (gate blocks re-fetch because subTasks !== undefined).
        if (!filtersActive && !options?.skipMemorySubtasks) {
          // Check memory first (preserves state during fast filter toggles)
          const inMemory = memoryMap.get(t.id);
          if (inMemory) {
            return {
              ...t,
              subTasks: inMemory.subTasks,
              subTasksHasMore: inMemory.subTasksHasMore,
              subTasksNextCursor: inMemory.subTasksNextCursor,
            };
          }

          // Check global cache
          const cached = getCache(t.id);
          if (cached) {
            return {
              ...t,
              subTasks: cached.subTasks,
              subTasksHasMore: cached.hasMore,
              subTasksNextCursor: cached.nextCursor,
            };
          }
        }
        return t;
      });

      // 🔬 DEBUG: Log what was resolved vs what couldn't be hydrated
      const noSubtaskIds = result
        .filter((t) => t.isParent && t.subTasks === undefined)
        .map((t) => t.name);
      const hasSubtaskIds = result
        .filter((t) => t.isParent && t.subTasks !== undefined)
        .map((t) => `${t.name}(${(t.subTasks as any)?.length}st)`);
      console.log(
        `[Hydrate${debugLabel ? ` @ ${debugLabel}` : ""}] MemoryCacheSize=${memoryMap.size} | Loaded=${hasSubtaskIds.join(", ")} | Missing=${noSubtaskIds.join(", ")}`,
      );

      return result;
    },
    [filtersActive],
  );

  const compareByCreatedAtAsc = useCallback((a: any, b: any) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;

    const aId = String(a?.id || "");
    const bId = String(b?.id || "");
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  }, []);

  const compareSubTasksFallback = useCallback(
    (a: any, b: any) => {
      const aPos =
        typeof a?.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
      const bPos =
        typeof b?.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      return compareByCreatedAtAsc(a, b);
    },
    [compareByCreatedAtAsc],
  );

  const getCanonicalProjectTaskIds = useCallback(
    (targetProjectId: string) => {
      const seen = new Set<string>();
      const orderedIds: string[] = [];
      const state = useTaskCacheStore.getState();

      const pushTask = (task: TaskWithSubTasks) => {
        if (
          task.projectId === targetProjectId &&
          !task.parentTaskId &&
          !seen.has(task.id)
        ) {
          seen.add(task.id);
          orderedIds.push(task.id);
        }
      };

      const cached = state.getProjectTasksCache(targetProjectId);
      cached?.tasks.forEach((task) => pushTask(task as TaskWithSubTasks));
      initialTasks.forEach((task) => pushTask(task));
      tasksRef.current.forEach((task) => pushTask(task));

      return orderedIds;
    },
    [initialTasks],
  );

  // Helper to compare subtasks by a sort field
  const compareByField = useCallback(
    (a: any, b: any, field: SortField, direction: "asc" | "desc") => {
      const dir = direction === "asc" ? 1 : -1;
      let aVal: any;
      let bVal: any;

      switch (field) {
        case "name":
          aVal = (a.name || "").toLowerCase();
          bVal = (b.name || "").toLowerCase();
          return dir * aVal.localeCompare(bVal);
        case "status": {
          const statusOrder: Record<string, number> = {
            TO_DO: 0,
            IN_PROGRESS: 1,
            REVIEW: 2,
            HOLD: 3,
            COMPLETED: 4,
            CANCELLED: 5,
          };
          aVal = statusOrder[a.status] ?? 99;
          bVal = statusOrder[b.status] ?? 99;
          return dir * (aVal - bVal);
        }
        case "startDate":
          aVal = a.startDate ? new Date(a.startDate).getTime() : 0;
          bVal = b.startDate ? new Date(b.startDate).getTime() : 0;
          return dir * (aVal - bVal);
        case "deadline": {
          // Deadline = startDate + days
          const aDue = a.startDate && a.days
            ? new Date(a.startDate).getTime() + a.days * 86400000
            : a.startDate ? new Date(a.startDate).getTime() : 0;
          const bDue = b.startDate && b.days
            ? new Date(b.startDate).getTime() + b.days * 86400000
            : b.startDate ? new Date(b.startDate).getTime() : 0;
          return dir * (aDue - bDue);
        }
        case "dueDate": {
          const aDue2 = a.startDate && a.days
            ? new Date(a.startDate).getTime() + a.days * 86400000
            : 0;
          const bDue2 = b.startDate && b.days
            ? new Date(b.startDate).getTime() + b.days * 86400000
            : 0;
          return dir * (aDue2 - bDue2);
        }
        case "createdAt":
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dir * (aVal - bVal);
        default:
          return 0;
      }
    },
    [],
  );

  const orderSubTasksForParent = useCallback(
    (parentTaskId: string, subTasks: any[], preferredSource?: any[]) => {
      const deduped = subTasks.filter(
        (subTask, index, self) =>
          index === self.findIndex((candidate) => candidate.id === subTask.id),
      );

      // If sorting is active, sort subtasks by the active sort field
      if (sorts.length > 0) {
        return deduped.sort((a, b) => {
          for (const sort of sorts) {
            const result = compareByField(a, b, sort.field, sort.direction);
            if (result !== 0) return result;
          }
          return compareSubTasksFallback(a, b);
        });
      }

      // Otherwise, use existing rank-based ordering
      const rankMap = new Map<string, number>();
      const canonicalSources = [
        preferredSource,
        tasksRef.current.find((task) => task.id === parentTaskId)?.subTasks,
        getCachedSubTasks(parentTaskId)?.subTasks,
      ];

      canonicalSources.forEach((source) => {
        source?.forEach((subTask: any) => {
          if (subTask?.id && !rankMap.has(subTask.id)) {
            rankMap.set(subTask.id, rankMap.size);
          }
        });
      });

      return deduped.sort((a, b) => {
        const aRank = rankMap.get(a.id);
        const bRank = rankMap.get(b.id);

        if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
        if (aRank !== undefined) return -1;
        if (bRank !== undefined) return 1;

        return compareSubTasksFallback(a, b);
      });
    },
    [sorts, compareByField, compareSubTasksFallback, getCachedSubTasks],
  );

  const orderRootTasks = useCallback(
    (taskList: TaskWithSubTasks[]) => {
      const deduped = taskList.filter(
        (task, index, self) =>
          index === self.findIndex((candidate) => candidate.id === task.id),
      );

      const projectRank = new Map<string, number>();
      projects.forEach((project, index) => {
        projectRank.set(project.id, index);
      });

      const projectTaskRanks = new Map<string, Map<string, number>>();

      const getTaskRankMap = (targetProjectId: string) => {
        if (!projectTaskRanks.has(targetProjectId)) {
          const rankMap = new Map<string, number>();
          getCanonicalProjectTaskIds(targetProjectId).forEach((taskId, index) => {
            rankMap.set(taskId, index);
          });
          projectTaskRanks.set(targetProjectId, rankMap);
        }
        return projectTaskRanks.get(targetProjectId)!;
      };

      return deduped.sort((a, b) => {
        const aProjectRank =
          projectRank.get(a.projectId || "") ?? Number.MAX_SAFE_INTEGER;
        const bProjectRank =
          projectRank.get(b.projectId || "") ?? Number.MAX_SAFE_INTEGER;

        if (aProjectRank !== bProjectRank) return aProjectRank - bProjectRank;

        const sameProjectId = a.projectId || b.projectId || "";
        const rankMap = getTaskRankMap(sameProjectId);
        const aRank = rankMap.get(a.id);
        const bRank = rankMap.get(b.id);

        if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
        if (aRank !== undefined) return -1;
        if (bRank !== undefined) return 1;

        return compareByCreatedAtAsc(a, b);
      });
    },
    [compareByCreatedAtAsc, getCanonicalProjectTaskIds, projects],
  );

  const normalizeFilteredTasks = useCallback(
    (taskList: TaskWithSubTasks[]) =>
      orderRootTasks(
        taskList.map((task) => ({
          ...task,
          subTasks: task.subTasks
            ? orderSubTasksForParent(task.id, task.subTasks)
            : task.subTasks,
        })),
      ),
    [orderRootTasks, orderSubTasksForParent],
  );

  const [tasks, setTasks] = useState<TaskWithSubTasks[]>(() =>
    hydrateTasks(orderRootTasks(initialTasks)),
  );
  const [projectPagination, setProjectPagination] = useState<
    Record<
      string,
      { page: number; nextCursor: any; hasMore: boolean; isLoading: boolean }
    >
  >(() => {
    const initial: any = {};

    if (level === "project" && projectId && initialTasks.length > 0) {
      initial[projectId] = {
        page: 1,
        nextCursor: initialNextCursor,
        hasMore: initialHasMore,
        isLoading: false,
      };
    }

    // Pre-populate pagination state from facets to enable lazy loading on expand
    if (projectCounts) {
      Object.entries(projectCounts).forEach(([pId, count]) => {
        if (count > 0 && !initial[pId]) {
          initial[pId] = {
            page: 1,
            nextCursor: undefined,
            hasMore: true,
            isLoading: false,
          };
        }
      });
    }

    return initial;
  });
  // ✅ DUP-FIX: Keep ref in sync so loadProjectTasks always reads the latest cursor
  projectPaginationRef.current = projectPagination;

  // 🧹 Filter Reset Logic: Ensures a clean slate when navigating between different views
  // This satisfies the user request to have filters reset to neutral when switching pages.
  useEffect(() => {
    return () => {
      clearFilters();
    };
  }, [clearFilters, workspaceId, projectId]);

  const mode = useMemo(() => {
    return sorts.length > 0 ? "sorted" : "hierarchy";
  }, [sorts]);

  const sortsKey = sorts.map((s) => `${s.field}:${s.direction}`).join(",");

  const fetchFiltered = useCallback(
    async (isAbortedRef: { current: boolean }) => {
      setIsLoadingFilters(true);
      setIsCurrentlyFiltered(true);
      // 🧼 Clear expansion gates: Every filter change must allow subtasks to be re-fetched
      // This prevents stale "already processed" markers from blocking subtask loading
      // after the filter changes what subtasks are visible.
      processedSubTasksRef.current.clear();
      fetchingSubTasksRef.current.clear();

      let fetchKey: string | undefined = undefined;
      try {
        const params = new URLSearchParams();
        params.set("w", workspaceId);
        if (level === "project" && projectId) params.set("p", projectId);
        params.set("vm", "list");
        params.set("l", "50");
        params.set("sub", "false");
        params.set("facets", "true");

        // Only set hierarchyMode to "parents" when NO filters are active
        // This ensures subtasks matching filters are also returned
        const hasActiveFiltersValue =
          hasActiveFilters(filters) || !!searchQuery;
        if (!hasActiveFiltersValue) {
          params.set("hm", "parents");
        }

        if (filters.projectId) params.set("p", filters.projectId);
        if (filters.status) params.set("s", filters.status);
        if (filters.assigneeId) params.set("a", filters.assigneeId);
        if (filters.tagId) params.set("t", filters.tagId);
        if (filters.startDate)
          params.set("da", new Date(filters.startDate).toISOString());
        if (filters.endDate)
          params.set("db", new Date(filters.endDate).toISOString());
        if (sorts.length > 0) params.set("sorts", JSON.stringify(sorts));
        if (searchQuery) {
          params.set("q", searchQuery);
        }

        fetchKey = `filtered-${params.toString()}`;
        if (fetchingIdsRef.current.has(fetchKey)) {
          setIsLoadingFilters(false);
          return;
        }
        fetchingIdsRef.current.add(fetchKey);
        hasFetchedRef.current = true;

        const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
        const response = await apiRes.json();

        if (isAbortedRef.current) return;

        if (response.success && response.data) {
          const result = response.data as any;
          const sizeInBytes = JSON.stringify(response.data).length;
          console.log(`[Zero-Weight] Filter Results:`, {
            count: result.tasks?.length || 0,
            size: `${(sizeInBytes / 1024).toFixed(2)} KB`,
            hasMore: result.hasMore,
            taskNames: result.tasks?.map((t: any) => t.name),
          });
          setTasks(() =>
            hydrateTasks(
              normalizeFilteredTasks(result.tasks),
              "filter-apply",
            ),
          );

          if (result.facets?.projects) {
            const facetProjects = result.facets.projects as Record<
              string,
              number
            >;
            setCurrentProjectCounts(facetProjects);

            setProjectPagination((prev) => {
              const next = { ...prev };
              let changed = false;
              Object.entries(facetProjects).forEach(([pId, count]) => {
                if (count > 0 && !next[pId]) {
                  next[pId] = {
                    page: 1,
                    nextCursor: undefined,
                    hasMore: true,
                    isLoading: false,
                  };
                  changed = true;
                }
              });
              return changed ? next : prev;
            });
          }

          if (result.facets?.projects) {
            setExpandedProjects((prev) => {
              const next = { ...prev };
              let changed = false;
              const facetProjects = result.facets.projects as Record<
                string,
                number
              >;
              Object.keys(facetProjects).forEach((pId) => {
                if (filtersActive && facetProjects[pId] > 0 && next[pId] === undefined) {
                  next[pId] = true;
                  changed = true;
                }
              });
              return changed ? next : prev;
            });
          }

          if (level === "workspace" && result.tasks.length > 0) {
            setProjectPagination((prev) => ({
              ...prev,
              ["__global_filter__"]: {
                page: 1,
                nextCursor: result.nextCursor,
                hasMore: result.hasMore,
                isLoading: false,
              },
            }));
          }
        }
      } catch (err) {
        console.error("Failed to filter tasks:", err);
        if (!isAbortedRef.current) toast.error("Failed to load tasks");
      } finally {
        // 🚀 BUG FIX: We must clear the lock using the SAME key we used at the start.
        // Re-calculating params here is error-prone and caused stale locks when 
        // parameters like 'hm' didn't match perfectly.
        if (typeof fetchKey !== 'undefined') {
          fetchingIdsRef.current.delete(fetchKey);
        }

        if (!isAbortedRef.current) {
          setIsLoadingFilters(false);
        }
      }
    },
    [
      workspaceId,
      projectId,
      level,
      filters,
      searchQuery,
      sorts,
      hydrateTasks,
      normalizeFilteredTasks,
    ],
  );

  const loadProjectTasks = useCallback(
    async (targetProjectId: string) => {
      let fetchKey: string | undefined = undefined;
      // ✅ DUP-FIX: Read from the always-current ref instead of the closed-over state
      // This prevents stale closures from re-fetching page 1 when "Load More" fires
      // after the initial batch has already updated projectPagination state.
      const currentPagination = projectPaginationRef.current[targetProjectId] || {
        page: 0,
        nextCursor: undefined,
        hasMore: true,
        isLoading: false,
      };

      if (currentPagination.isLoading || !currentPagination.hasMore) return;

      // Immediately mark as loading in the ref to prevent concurrent calls
      projectPaginationRef.current = {
        ...projectPaginationRef.current,
        [targetProjectId]: { ...currentPagination, isLoading: true },
      };
      setProjectPagination((prev) => ({
        ...prev,
        [targetProjectId]: { ...currentPagination, isLoading: true },
      }));

      const isGlobal = targetProjectId === "__global_filter__";
      console.log(`[LazyLoad] Fetching tasks for project: ${targetProjectId}, Page: ${currentPagination.page + 1}, Cursor: ${JSON.stringify(currentPagination.nextCursor)}`);

      const params = new URLSearchParams();
      params.set("w", workspaceId);
      if (!isGlobal) params.set("p", targetProjectId);
      params.set("vm", "list");
      params.set("hm", "parents");
      params.set("sub", "false");
      params.set("l", "50");
      if (currentPagination.nextCursor)
        params.set("c", JSON.stringify(currentPagination.nextCursor));
      if (filters.status) params.set("s", filters.status);
      if (filters.assigneeId) params.set("a", filters.assigneeId);
      if (filters.tagId) params.set("t", filters.tagId);
      if (searchQuery) params.set("q", searchQuery);
      if (filters.startDate)
        params.set("da", new Date(filters.startDate).toISOString());
      if (filters.endDate)
        params.set("db", new Date(filters.endDate).toISOString());

      fetchKey = `project-${targetProjectId}-${params.toString()}`;
      if (fetchingIdsRef.current.has(fetchKey)) return;
      fetchingIdsRef.current.add(fetchKey);

      try {
        const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
        const response = await apiRes.json();

        if (response.success && response.data) {
          const resultData = response.data as any;
          const newTasksFromServer = resultData.tasks as unknown as TaskWithSubTasks[];

          setTasks((prevTasks) => {
            let nextTasks: TaskWithSubTasks[] = [];
            let addedRoots: TaskWithSubTasks[] = [];

            if (!isGlobal) {
              const existingIds = new Set(prevTasks.map((t) => t.id));
              addedRoots = newTasksFromServer.filter(
                (task) => !existingIds.has(task.id),
              );
              // Ensure we sort and deduplicate the FINAL set aggressively
              const mergedRootTasks = filtersActive
                ? normalizeFilteredTasks([...prevTasks, ...addedRoots])
                : orderRootTasks([...prevTasks, ...addedRoots]);
              nextTasks = hydrateTasks(mergedRootTasks);
            } else {
              const taskMap = new Map<string, TaskWithSubTasks>();
              prevTasks.forEach((t) => taskMap.set(t.id, { ...t }));

              newTasksFromServer.forEach((task) => {
                if (taskMap.has(task.id)) {
                  const existing = taskMap.get(task.id)!;
                  if (task.subTasks && task.subTasks.length > 0) {
                    existing.subTasks = orderSubTasksForParent(
                      task.id,
                      [...(existing.subTasks || []), ...task.subTasks],
                      existing.subTasks,
                    );
                  }
                } else {
                  const newTask = { ...task };
                  taskMap.set(newTask.id, newTask);
                  addedRoots.push(newTask);
                }
              });
              nextTasks = hydrateTasks(
                normalizeFilteredTasks(Array.from(taskMap.values())),
              );
            }

            // 📊 Force update count metadata if this project was previously empty
            if (addedRoots.length > 0) {
              setCurrentProjectCounts((prevCounts) => {
                const current = prevCounts?.[targetProjectId] || 0;
                if (current === 0) {
                  return { ...prevCounts, [targetProjectId]: addedRoots.length };
                }
                return prevCounts;
              });
            }

            // Expand roots if auto-expand is on (for new items)
            if (autoExpandRef.current && addedRoots.length > 0) {
              setTimeout(() => {
                setExpanded((prevExpanded) => {
                  const newExpanded = { ...prevExpanded };
                  addedRoots.forEach((t) => {
                    newExpanded[t.id] = true;
                  });
                  return newExpanded;
                });
              }, 0);
            }

            return nextTasks;
          });

          const nextPaginationEntry = {
            page: currentPagination.page + 1,
            nextCursor: resultData.nextCursor,
            hasMore: resultData.hasMore ?? false,
            isLoading: false,
          };

          // Cache Logic
          if (!filtersActive && !isGlobal) {
            useTaskCacheStore.getState().setProjectTasksCache(targetProjectId, {
              tasks: newTasksFromServer.filter((t) => t.projectId === targetProjectId),
              hasMore: resultData.hasMore ?? false,
              page: currentPagination.page + 1,
              nextCursor: resultData.nextCursor,
              totalCount: resultData.totalCount ?? undefined,
            });
          }

          // ✅ DUP-FIX: Update ref immediately so next call reads the correct cursor
          projectPaginationRef.current = {
            ...projectPaginationRef.current,
            [targetProjectId]: nextPaginationEntry,
          };
          setProjectPagination((prev) => ({
            ...prev,
            [targetProjectId]: nextPaginationEntry,
          }));
        } else {
          toast.error(response.error || "Failed to load tasks");
          const resetEntry = { ...currentPagination, isLoading: false };
          projectPaginationRef.current = {
            ...projectPaginationRef.current,
            [targetProjectId]: resetEntry,
          };
          setProjectPagination((prev) => ({
            ...prev,
            [targetProjectId]: resetEntry,
          }));
        }
      } catch (err) {
        console.error(`Failed to load tasks for ${targetProjectId}:`, err);
        const resetEntry = { ...currentPagination, isLoading: false };
        projectPaginationRef.current = {
          ...projectPaginationRef.current,
          [targetProjectId]: resetEntry,
        };
        setProjectPagination((prev) => ({
          ...prev,
          [targetProjectId]: resetEntry,
        }));
      } finally {
        fetchingIdsRef.current.delete(fetchKey);
      }
    },
    [
      workspaceId,
      filters,
      searchQuery,
      // ✅ DUP-FIX: projectPagination removed — we read from projectPaginationRef instead
      // so the callback stays stable and loadProjectTasksRef always holds the latest version
      hydrateTasks,
      filtersActive,
      loadingSubTasks,
      level,
      normalizeFilteredTasks,
      orderSubTasksForParent,
    ],
  );

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  tasksRef.current = tasks;

  useEffect(() => {
    if (!initialTasks || initialTasks.length === 0) return;

    const state = useTaskCacheStore.getState();
    const tasksByProject: Record<string, TaskWithSubTasks[]> = {};

    initialTasks.forEach((t) => {
      const pId = t.projectId || "unknown";
      if (!tasksByProject[pId]) tasksByProject[pId] = [];
      tasksByProject[pId].push(t);
    });

    Object.entries(tasksByProject).forEach(([pId, newTasks]) => {
      const currentCache = state.getProjectTasksCache(pId);

      if (currentCache) {
        const mergedMap = new Map();
        currentCache.tasks.forEach((t) => mergedMap.set(t.id, t));
        newTasks.forEach((t) => mergedMap.set(t.id, t));

        state.setProjectTasksCache(pId, {
          ...currentCache,
          tasks: Array.from(mergedMap.values()) as TaskWithSubTasks[],
        });
      } else {
        state.setProjectTasksCache(pId, {
          tasks: newTasks,
          hasMore: initialHasMore,
          page: 1,
          totalCount: initialTotalCount || newTasks.length,
        });
      }
    });
  }, [initialTasks, initialHasMore, initialTotalCount, setProjectTasksCache]);

  // Hydration-safe Cache Merge
  useEffect(() => {
    if (filtersActive) return;

    const state = useTaskCacheStore.getState();
    const getProjCache = state.getProjectTasksCache;
    const getSubCache = state.getCachedSubTasks;

    const relevantProjectIds =
      level === "project" && projectId
        ? [projectId]
        : projects.map((p) => p.id);

    // 1. Resolve Pagination from Cache
    setProjectPagination((prev) => {
      const next = { ...prev };
      let changed = false;

      relevantProjectIds.forEach((pId) => {
        const cached = getProjCache(pId);
        if (cached && !next[pId]) {
          next[pId] = {
            page: cached.page,
            nextCursor: cached.nextCursor,
            hasMore: cached.hasMore,
            isLoading: false,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    // 2. Hydrate subtasks from cache for existing tasks only
    // Do NOT inject cached root tasks here, as they break pagination and ordering invariants!
    setTasks((prev) => {
      return prev.map((t) => {
        if (t.subTasks !== undefined) return t;
        const cached = getSubCache(t.id);
        if (cached) {
          return {
            ...t,
            subTasks: cached.subTasks,
            subTasksHasMore: cached.hasMore,
            subTasksNextCursor: cached.nextCursor,
          };
        }
        return t;
      });
    });
  }, [level, projectId, projects, filtersActive]);

  // 🚀 INITIAL DATA LOAD (Hono-First)
  useEffect(() => {
    const isAbortedRef = { current: false };
    const hasInitialData = initialTasks && initialTasks.length > 0;

    // 🛡️ Mount Guard: If we have initial data and filters are neutral, trust RSC.
    const isNeutral =
      !searchQuery &&
      Object.values(filters).every(
        (v) =>
          v === undefined || v === "" || (Array.isArray(v) && v.length === 0),
      );

    if (!hasFetchedRef.current && hasInitialData && isNeutral) {
      hasFetchedRef.current = true;
      return;
    }

    const shouldInitialFetch =
      !hasInitialData || isShell || !hasFetchedRef.current;

    if (shouldInitialFetch && !filtersActive) {
      if (level === "project" && projectId) {
        loadProjectTasks(projectId);
      } else {
        // fetchFiltered(isAbortedRef); 
        // 🚀 Deferred: Skip workspace-wide fetch on mount to favor project-by-project lazy expansion.
      }
    }
    return () => {
      isAbortedRef.current = true;
    };
  }, [
    fetchFiltered,
    loadProjectTasks,
    initialTasks,
    projectId,
    level,
    filtersActive,
    isShell,
    searchQuery,
    filters,
  ]);

  useEffect(() => {
    // Release the mount guard once initial cycle is potentially settled
    const timer = setTimeout(() => {
      isInitialMountRef.current = false;
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!filtersActive) return;

    setExpandedProjects((prev) => {
      const next = { ...prev };
      let changed = false;
      tasks.forEach((t) => {
        const pId = t.projectId || "unknown";
        if (next[pId] === undefined) {
          next[pId] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setExpanded((prev) => {
      const next = { ...prev };
      let changed = false;
      const visit = (t: TaskWithSubTasks) => {
        if (t.id && next[t.id] === undefined) {
          next[t.id] = true;
          changed = true;
        }
        if (t.subTasks) t.subTasks.forEach(visit);
      };
      tasks.forEach(visit);
      return changed ? next : prev;
    });
  }, [filtersActive, tasks]);

  useEffect(() => {
    if (level !== "workspace" || !filtersActive || isLoadingFilters) return;
    if (!currentProjectCounts) return;

    const pendingProjectIds = projects
      .filter((project) => {
        const hasMatches = (currentProjectCounts[project.id] || 0) > 0;
        const hasLoadedTasks = tasks.some((task) => task.projectId === project.id);
        const pagination = projectPagination[project.id];

        return (
          hasMatches &&
          !hasLoadedTasks &&
          expandedProjects[project.id] === true &&
          !!pagination?.hasMore &&
          !pagination.isLoading
        );
      })
      .map((project) => project.id);

    if (pendingProjectIds.length === 0 || filteredProjectQueueRunningRef.current) {
      return;
    }

    let cancelled = false;
    filteredProjectQueueRunningRef.current = true;

    (async () => {
      try {
        for (const pendingProjectId of pendingProjectIds) {
          if (cancelled) break;
          await loadProjectTasks(pendingProjectId);
        }
      } finally {
        filteredProjectQueueRunningRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    level,
    filtersActive,
    isLoadingFilters,
    currentProjectCounts,
    projects,
    tasks,
    projectPagination,
    expandedProjects,
    loadProjectTasks,
  ]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    loadProjectTasksRef.current = loadProjectTasks;
  }, [loadProjectTasks]);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  const getObserver = () => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const projectId = (entry.target as HTMLElement).dataset.projectId;

              if (projectId === "sorted") {
                loadMoreSortedRef.current?.();
              } else if (projectId) {
                loadProjectTasksRef.current?.(projectId);
              }
            }
          });
        },
        { rootMargin: "200px" },
      );
    }
    return observerRef.current;
  };



  useEffect(() => {
    const isAbortedRef = { current: false };

    // 🚀 Zero-Weight Optimization: Skip the automatic fetch on initial mount if no filters are active.
    // We trust the server-provided initialTasks and projectCounts.
    if (isInitialMountRef.current && !filtersActive) {
      isInitialMountRef.current = false;
      hasFetchedRef.current = true;
      setIsLoadingFilters(false);
      return;
    }
    isInitialMountRef.current = false;

    // Skip if nothing changed AND we already have data
    // 🛡️ Standardized Filter Detection
    const activeFilters = hasActiveFilters(filters);
    const isBaseProjectView =
      !searchQuery &&
      (!activeFilters ||
        (getActiveFilters(filters).length === 1 &&
          filters.projectId === projectId));

    const needsReset =
      isBaseProjectView &&
      (isCurrentlyFiltered || (hasFetchedRef.current && tasks.length === 0));

    if (needsReset) {
      if (isCurrentlyFiltered || tasks.length === 0) {
        // Reset to initial data OR cache
        const cache = useTaskCacheStore
          .getState()
          .getProjectTasksCache(projectId || "");
        console.log(
          `[FilterReset] Clearing filter. Cache=${cache?.tasks.length ?? 0}, Memory=${tasksRef.current.length}`,
        );
        processedSubTasksRef.current.clear();
        fetchingSubTasksRef.current.clear();
        if (cache && cache.tasks.length > 0) {
          setTasks(
            hydrateTasks(cache.tasks, "filter-reset-cache", {
              skipMemorySubtasks: true,
            }),
          );
        } else if (initialTasks && initialTasks.length > 0) {
          setTasks(
            hydrateTasks(initialTasks, "filter-reset-initialTasks", {
              skipMemorySubtasks: true,
            }),
          );
        } else {
          // 🚀 Fallback: Trigger a fresh fetch of the base data
          if (level === "project" && projectId) {
            loadProjectTasks(projectId);
          } else if (level === "workspace" && tasks.length === 0) {
            fetchFiltered(isAbortedRef);
          }
        }

        setProjectPagination({});
        setIsCurrentlyFiltered(false);
        // 🧼 Expansion State Cleanup: Ensure the UI isn't 'stuck' during re-expansion after a reset
        processedSubTasksRef.current.clear();
        fetchingSubTasksRef.current.clear();
      }
      setIsLoadingFilters(false);
      return;
    }

    const timer = setTimeout(() => {
      fetchFiltered(isAbortedRef);
    }, 200);

    return () => {
      isAbortedRef.current = true;
      clearTimeout(timer);
    };
  }, [fetchFiltered, searchQuery, filters, sortsKey]);

  // Effect to load sorted/filtered tasks when flat mode is active
  useEffect(() => {
    if (mode !== "sorted") {
      setSortedTasks([]);
      setSortedHasMore(false);
      return;
    }

    let isMounted = true;

    const fetchSorted = async () => {
      setIsSortedViewLoading(true);

      const params = new URLSearchParams();
      params.set("w", workspaceId);
      if (level === "project" && projectId) params.set("p", projectId);
      params.set("vm", "list");
      params.set("onlySub", "true");
      params.set("l", "20");
      if (filters.status) params.set("s", filters.status);
      if (filters.assigneeId) params.set("a", filters.assigneeId);
      if (filters.tagId) params.set("t", filters.tagId);
      if (searchQuery) params.set("q", searchQuery);
      if (filters.startDate)
        params.set("da", new Date(filters.startDate).toISOString());
      if (filters.endDate)
        params.set("db", new Date(filters.endDate).toISOString());
      if (sorts.length > 0) params.set("sorts", JSON.stringify(sorts));

      const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
      const res = await apiRes.json();

      if (!isMounted) return;

      if (res.success && res.data) {
        setSortedTasks(res.data.tasks || []);
        setSortedHasMore(res.data.hasMore);
        setSortedNextCursor(res.data.nextCursor);
      }

      setIsSortedViewLoading(false);
    };

    setSortedHasMore(false);
    setSortedNextCursor(null);

    fetchSorted();

    return () => {
      isMounted = false;
    };
  }, [sortsKey, workspaceId, projectId, filters, searchQuery]);

  const loadMoreSorted = async () => {
    if (!sortedHasMore || isLoadingMoreSorted) return;
    setIsLoadingMoreSorted(true);

    try {
      const params = new URLSearchParams();
      params.set("w", workspaceId);
      if (level === "project" && projectId) params.set("p", projectId);
      params.set("vm", "list");
      params.set("onlySub", "true");
      params.set("l", "20");
      if (sortedNextCursor) params.set("c", JSON.stringify(sortedNextCursor));
      if (filters.status) params.set("s", filters.status);
      if (filters.assigneeId) params.set("a", filters.assigneeId);
      if (filters.tagId) params.set("t", filters.tagId);
      if (searchQuery) params.set("q", searchQuery);
      if (filters.startDate)
        params.set("da", new Date(filters.startDate).toISOString());
      if (filters.endDate)
        params.set("db", new Date(filters.endDate).toISOString());
      if (sorts.length > 0) params.set("sorts", JSON.stringify(sorts));

      const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
      const res = await apiRes.json();

      if (res.success && res.data) {
        const newTasks = res.data.tasks || [];
        setSortedTasks((prev) => [...prev, ...newTasks]);
        setSortedHasMore(res.data.hasMore);
        setSortedNextCursor(res.data.nextCursor);
      } else {
        toast.error("Failed to load more sorted tasks");
        setSortedHasMore(false);
      }
    } catch (err) {
      console.error("[LoadMoreSorted] Runtime error:", err);
      toast.error("An error occurred while loading more tasks");
    } finally {
      setIsLoadingMoreSorted(false);
    }
  };

  useEffect(() => {
    loadMoreSortedRef.current = loadMoreSorted;
  }, [loadMoreSorted]);



  // Re-order existing in-memory subtasks when sort changes
  useEffect(() => {
    if (sorts.length === 0) return;
    processedSubTasksRef.current.clear();
    fetchingSubTasksRef.current.clear();
    setTasks((prev) =>
      prev.map((t) => {
        if (t.subTasks && t.subTasks.length > 1) {
          return {
            ...t,
            subTasks: orderSubTasksForParent(t.id, t.subTasks),
          };
        }
        return t;
      }),
    );
  }, [sortsKey]);

  const [activeInlineProjectId, setActiveInlineProjectId] = useState<
    string | null
  >(null);

  const toggleProjectExpand = (targetProjectId: string) => {
    setExpandedProjects((prev) => {
      const isExpanding = !prev[targetProjectId];
      return {
        ...prev,
        [targetProjectId]: isExpanding,
      };
    });
    const isCurrentlyExpanded = expandedProjects[targetProjectId];
    if (!isCurrentlyExpanded) {
      // Trigger load if:
      // 1. Project has no tasks loaded AND metadata shows it might have some (or no pagination exists yet)
      const localTasks = tasks;
      const projectTasks = localTasks.filter((t) => t.projectId === targetProjectId);
      const hasNoTasksLoaded = projectTasks.length === 0;
      const pagination = projectPagination[targetProjectId];

      if (
        !isCurrentlyExpanded && 
        hasNoTasksLoaded && 
        (!pagination || pagination.hasMore)
      ) {
        console.log(`[ExpandProject] Project "${targetProjectId}" is empty. Triggering load...`);
        loadProjectTasks(targetProjectId);
      } else {
        console.log(`[ExpandProject] Project "${targetProjectId}" already has ${projectTasks.length} tasks or no more data. Skipping load.`);
      }
    }
  };

  const ensureFilteredProjectLoad = useCallback(
    (targetProjectId: string) => {
      if (level !== "workspace") return;

      const hasMatches = (currentProjectCounts?.[targetProjectId] || 0) > 0;
      const hasLoadedTasks = tasksRef.current.some(
        (task) => task.projectId === targetProjectId,
      );
      const pagination = projectPagination[targetProjectId];
      const canLoadUnfiltered =
        !filtersActive && !!pagination?.hasMore && !pagination.isLoading;

      if (
        expandedProjects[targetProjectId] === true &&
        !hasLoadedTasks &&
        ((filtersActive &&
          hasMatches &&
          !!pagination?.hasMore &&
          !pagination.isLoading) ||
          canLoadUnfiltered)
      ) {
        loadProjectTasks(targetProjectId);
      }
    },
    [
      level,
      filtersActive,
      currentProjectCounts,
      projectPagination,
      expandedProjects,
      loadProjectTasks,
    ],
  );

  const handleSubTaskClick = (subTask: SubTaskType) => {
    // Inject project metadata if it's missing but we have it in our map
    const project =
      subTask.projectId && projectMap ? projectMap[subTask.projectId] : null;
    const subTaskWithMetadata = {
      ...subTask,
      project: (subTask as any).project || project,
    };
    openSubTaskSheet(subTaskWithMetadata);
  };

  useEffect(() => {
    if (
      level === "project" &&
      projectId &&
      !projectPagination[projectId] &&
      !filtersActive
    ) {
      loadProjectTasks(projectId);
    }
  }, [level, projectId, filters, searchQuery]);

  const { openSubTaskSheet } = useSubTaskSheetActions();

  const filterOptions = React.useMemo(() => {
    const options = extractAllFilterOptions(
      tasks as any,
      showAdvancedFilters ? "workspace" : "project",
    );

    const assigneesForFilter =
      assignees ||
      members
        .filter((member) => member.user)
        .map((member) => ({
          id: member.user!.id,
          surname: member.user!.surname || undefined,
        }))
        .sort((a, b) => {
          const nameA = `${a.surname || ""}`.trim();
          const nameB = `${b.surname || ""}`.trim();
          return nameA.localeCompare(nameB);
        });

    return {
      ...options,
      assignees: assigneesForFilter,
      tags: tags,
      projects: projects,
    };
  }, [tasks, showAdvancedFilters, members, assignees, tags, projects]);

  // Calculate project task counts
  const projectTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((task) => {
      const pId = task.projectId || "unknown";
      counts[pId] = (counts[pId] || 0) + 1;
    });
    return counts;
  }, [tasks]);

  // Calculate grouped tasks - MOVED UP before use
  const groupedTasks = useMemo(() => {
    if (level !== "workspace") return null;
    const groups: Record<string, TaskWithSubTasks[]> = {};

    // Ensure all projects that have tasks (discovered via facets or current tasks)
    // are initialized so the project loop maintains consistent ordering.
    if (!filtersActive) {
      projects.forEach((project) => {
        groups[project.id] = [];
      });
    } else if (currentProjectCounts) {
      projects.forEach((project) => {
        if ((currentProjectCounts[project.id] || 0) > 0) {
          groups[project.id] = [];
        }
      });
    } else if (isLoadingFilters) {
      // ✅ While loading, keep previous project structure visible
      // to prevent groups from vanishing mid-load
      projects.forEach((project) => {
        if (tasks.some((t) => t.projectId === project.id)) {
          groups[project.id] = [];
        }
      });
    }

    tasks.forEach((task) => {
      const pId = task.projectId || "unknown";
      if (!groups[pId]) {
        groups[pId] = [];
      }
      groups[pId].push(task);
    });
    return groups;
  }, [
    tasks,
    level,
    projects,
    filtersActive,
    currentProjectCounts,
    isLoadingFilters,
  ]);

  const orderedWorkspaceProjects = useMemo(() => {
    if (level !== "workspace") return projects;

    // Explicitly sort projects by ID descending (newest first) to ensure consistent ordering.
    // Based on the prisma data layer, higher IDs correspond to more recently created projects.
    return [...projects]
      .filter((project) => {
        const hasTasksInMemory = !!groupedTasks?.[project.id];
        const hasFacetHits = (currentProjectCounts?.[project.id] ?? 0) > 0;
        return hasTasksInMemory || hasFacetHits;
      })
      .sort((a, b) => {
        const aId = String(a.id || "");
        const bId = String(b.id || "");
        return bId.localeCompare(aId, undefined, { numeric: true });
      });
  }, [level, projects, groupedTasks, currentProjectCounts]);

  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
    assignee: true,
    reviewer: true,
    startDate: true,
    dueDate: true,
    progress: true,
    status: true,
    tag: true,
    description: true,
    project: level === "workspace",
  });

  const visibleColumnsCount =
    2 +
    Object.entries(columnVisibility).filter(([k, v]) => k !== "project" && v)
      .length +
    1;

  // 🔥 MASTER SUBTASK LOADER: The Single Source of Truth

  // 1. Lazy Subtask Loader Callback (Passed to TaskRow)
  const handleRequestSubtasks = useCallback(
    async (taskId: string) => {
      if (
        processedSubTasksRef.current.has(taskId) ||
        fetchingSubTasksRef.current.has(taskId)
      ) {
        console.log(
          `[SubtaskGate] BLOCKED taskId=${taskId} | processed=${processedSubTasksRef.current.has(taskId)} | fetching=${fetchingSubTasksRef.current.has(taskId)}`,
        );
        return;
      }

      // Note: references active 'tasks' state via closure or ref would be better,
      // but for now we look up in current render scope tasks.
      // 2. Memory Check: If already loaded in our master state, don't refetch
      const currentTaskInState = tasksRef.current.find((t) => t.id === taskId);
      // ✅ Bug 3 Fix: When filters are active, only trust in-memory subTasks if they
      // were fetched during THIS filter session. processedSubTasksRef is cleared on
      // every filter change, so stale hydrated data won't block a fresh filtered fetch.
      const isProcessedThisSession = processedSubTasksRef.current.has(taskId);
      if (currentTaskInState?.subTasks !== undefined && (!filtersActive || isProcessedThisSession)) {
        console.log(
          `[SubtaskGate] IN-MEMORY taskId=${taskId} subTaskCount=${currentTaskInState.subTasks?.length} filteredSession=${isProcessedThisSession}`,
        );
        processedSubTasksRef.current.add(taskId);
        return;
      }

      // Cache Hit
      const cached = getCachedSubTasks(taskId);
      if (cached) {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                subTasks: cached.subTasks,
                subTasksHasMore: cached.hasMore,
                subTasksNextCursor: cached.nextCursor,
              };
            }
            return t;
          }),
        );
        processedSubTasksRef.current.add(taskId);
        return;
      }

      // Fetch
      fetchingSubTasksRef.current.add(taskId);
      setLoadingSubTasks((prev) => ({ ...prev, [taskId]: true }));

      const taskProjectId = currentTaskInState?.projectId || projectId || "";

      try {
        // Include current filters so expanded subtasks match the filtered dataset
        const activeFilters = {
          ...filters,
          search: searchQuery || filters.search,
          workspaceId,
        };

        const params = new URLSearchParams();
        params.set("w", workspaceId);
        params.set("ids", taskId);
        if (taskProjectId) params.set("p", taskProjectId);
        params.set("ps", "30");
        params.set("vm", "list");

        // Don't use JSON.stringify - it adds quotes around strings
        if (activeFilters.status) params.set("s", activeFilters.status);
        if (activeFilters.assigneeId) params.set("a", activeFilters.assigneeId);
        if (activeFilters.tagId) params.set("t", activeFilters.tagId);
        if (activeFilters.search) params.set("q", activeFilters.search);
        if (filters.startDate)
          params.set("da", new Date(filters.startDate).toISOString());
        if (filters.endDate)
          params.set("db", new Date(filters.endDate).toISOString());
        if (sorts.length > 0) params.set("sorts", JSON.stringify(sorts));

        const fetchUrl = `/api/v1/tasks/expansion/batch?${params.toString()}`;
        console.log(`🔍 [CLIENT] Requesting subtasks expansion: ${fetchUrl}`);
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error("Failed to fetch subtasks");
        const responseData = await res.json();

        // The batch route returns an array of results in .data
        if (responseData.success && responseData.data && responseData.data[0]) {
          const result = responseData.data[0];
          const subTasks = result.subTasks || [];
          const sizeInBytes = JSON.stringify(responseData.data).length;
          console.log(
            `[Zero-Weight] Batch Expansion Payload: ${(sizeInBytes / 1024).toFixed(2)} KB (Target: ${taskId})`,
          );

          processedSubTasksRef.current.add(taskId);

          // Dedup
          const uniqueSubTasks = subTasks.filter(
            (st: any, index: number, self: any[]) =>
              index === self.findIndex((t: any) => t.id === st.id),
          );
          const orderedSubTasks = orderSubTasksForParent(
            taskId,
            uniqueSubTasks,
            currentTaskInState?.subTasks,
          );

          if (!filtersActive) {
            setCachedSubTasks(taskId, {
              subTasks: orderedSubTasks,
              hasMore: result.hasMore,
              nextCursor: result.nextCursor,
            });
          }

          setTasks((prev) =>
            prev.map((t) => {
              if (t.id === taskId) {
                return {
                  ...t,
                  subTasks: orderedSubTasks,
                  subTasksHasMore: result.hasMore,
                  subTasksNextCursor: result.nextCursor,
                };
              }
              return t;
            }),
          );
        }
      } catch (err) {
        console.error(`Failed to load subtasks for ${taskId}`, err);
      } finally {
        fetchingSubTasksRef.current.delete(taskId);
        setLoadingSubTasks((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      }
    },
    [
      projectId,
      workspaceId,
      filters,
      searchQuery,
      getCachedSubTasks,
      orderSubTasksForParent,
      setCachedSubTasks,
    ],
  );

  // 3. UI-ONLY Toggle
  const toggleExpand = useCallback(
    (taskId: string) => {
      setExpanded((prev) => {
        const isExpanding = !prev[taskId];
        if (isExpanding) {
          const task = tasksRef.current.find((t) => t.id === taskId);
          if (
            task &&
            (task.subTasks === undefined || task.subTasks.length === 0) &&
            // ✅ Bug 1 Fix: When filters are active, ignore subtaskCount (which reflects
            // the UNFILTERED total). A parent may have 0 in the stripped payload but
            // still have matching subtasks under the current filter — always try to fetch.
            (filtersActive || task.subtaskCount > 0)
          ) {
            handleRequestSubtasks(taskId);
          }
        }
        return { ...prev, [taskId]: isExpanding };
      });
    },
    [handleRequestSubtasks],
  );

  // 4. UI-ONLY Expand All
  // 4. UI-ONLY Expand All + Cached Load
  const handleExpandAll = () => {
    autoExpandRef.current = true;

    // 1. Expand all projects (Existing ones will show, others will load on scroll)
    const allProjectIds = projects.map((p) => p.id);
    const allProjects = allProjectIds.reduce(
      (acc, pId) => ({ ...acc, [pId]: true }),
      {},
    );
    setExpandedProjects(allProjects);

    // 🚀 Optimization: Remove the manual loadProjectTasks(id) loop.
    // Sentinels will handle loading as the user scrolls down naturally.

    // 2. Bulk Apply Cache for Immediate Display
    setTasks((prev) => hydrateTasks(prev));

    // 3. Expand all tasks (This will trigger lazy loaders for items that hit the viewport)
    const allTasksMap: Record<string, boolean> = {};
    tasks.forEach((t) => {
      allTasksMap[t.id] = true;
    });
    setExpanded(allTasksMap);
  };

  const handleCollapseAll = () => {
    autoExpandRef.current = false;
    // Collapse all tasks
    setExpanded({});
    // Collapse all projects
    setExpandedProjects({});
  };

  const loadMoreSubTasks = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !task.subTasks) return;

    if (loadingMoreSubTasks[taskId]) return;
    setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: true }));

    try {
      const cleanFilters: any = {};
      const rawFilters = {
        ...filters,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        search: searchQuery || undefined,
      };
      Object.keys(rawFilters).forEach((key) => {
        // @ts-ignore
        const value = rawFilters[key];
        if (value !== undefined && value !== null && value !== "") {
          cleanFilters[key] = value;
        }
      });

      const params = new URLSearchParams();
      params.set("w", workspaceId);
      params.set("p", task.projectId || projectId);
      params.set("vm", "list"); // Hierarchy mode but for a specific parent
      params.set("pt", taskId);
      params.set("l", "50");
      if (task.subTasksNextCursor)
        params.set("c", JSON.stringify(task.subTasksNextCursor));
      if (cleanFilters.status)
        params.set("s", JSON.stringify(cleanFilters.status));
      if (cleanFilters.assigneeId)
        params.set("a", JSON.stringify(cleanFilters.assigneeId));
      if (cleanFilters.tagId)
        params.set("t", JSON.stringify(cleanFilters.tagId));
      if (cleanFilters.search) params.set("q", cleanFilters.search);
      if (cleanFilters.startDate)
        params.set("da", new Date(cleanFilters.startDate).toISOString());
      if (cleanFilters.endDate)
        params.set("db", new Date(cleanFilters.endDate).toISOString());
      if (sorts.length > 0) params.set("sorts", JSON.stringify(sorts));

      const apiRes = await fetch(`/api/v1/tasks?${params.toString()}`);
      const response = await apiRes.json();

      if (response.success && response.data) {
        const resultData = response.data as any;
        console.log(
          `[CLIENT] Loaded more subtasks for parent ${taskId}:`,
          resultData.tasks,
        );
        // Deduplicate: combine existing + new subtasks, remove duplicates
        const existingSubTasks = task.subTasks || [];
        const existingIds = new Set(existingSubTasks.map((st) => st.id));
        const newSubTasks = (resultData.tasks as any[]).filter(
          (st: any) => st.id && !existingIds.has(st.id),
        );
        const combinedSubTasks = orderSubTasksForParent(taskId, [
          ...existingSubTasks,
          ...newSubTasks,
        ], existingSubTasks);

        if (!filtersActive) {
          setCachedSubTasks(taskId, {
            subTasks: combinedSubTasks,
            hasMore: resultData.hasMore,
            nextCursor: resultData.nextCursor,
          });
        }

        setTasks((prevTasks) =>
          prevTasks.map((t) =>
            t.id === taskId
              ? {
                ...t,
                subTasks: combinedSubTasks,
                subTasksHasMore: resultData.hasMore,
                subTasksNextCursor: resultData.nextCursor,
              }
              : t,
          ),
        );
      } else {
        toast.error(response.error || "Failed to load more subtasks");
      }
    } catch (error) {
      console.error("Error loading more subtasks:", error);
      toast.error("Failed to load more subtasks");
    } finally {
      setLoadingMoreSubTasks((prev) => ({ ...prev, [taskId]: false }));
    }
  };
  const handleSort = (field: SortField) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.field === field);

      // If no sort active → start ASC
      if (!existing) {
        return [{ field, direction: "asc" as const }];
      }

      // If ASC → switch to DESC
      if (existing.direction === "asc") {
        return [{ field, direction: "desc" as const }];
      }

      // If DESC → remove sort
      return [];
    });
  };

  return (
    <div className="space-y-4 mt-0">
      <div className="flex items-center gap-2">
        <GlobalFilterToolbar
          className="flex-1"
          level={showAdvancedFilters ? "workspace" : "project"}
          view="list"
          filters={filters}
          searchQuery={searchQuery}
          projects={projects}
          members={filterOptions.assignees}
          tags={filterOptions.tags}
          onFilterChange={debouncedSetFilters}
          onSearchChange={setSearchQuery}
          onClearAll={() => {
            setFilters({});
            setSearchQuery("");
            setSorts([]); // Also clear sorts when clearing all filters
          }}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
        />
      </div>

      <div className="rounded-md border overflow-hidden relative">
        {isLoadingFilters && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm transition-all duration-300">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                Filtering...
              </span>
            </div>
          </div>
        )}
        <div
          ref={scrollContainerRef}
          className={cn(
            "overflow-auto",
            level === "workspace" ? "max-h-[70vh]" : "max-h-[65vh]",
            "mt-0",
            "[&::-webkit-scrollbar]:w-0.5",
            "[&::-webkit-scrollbar]:h-1",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:bg-slate-300",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:hover:bg-slate-400",
          )}
        >
          <table className="w-full caption-bottom text-sm table-fixed">
            <thead className="[&_tr]:border-b">
              <tr className="sticky top-0 z-10 bg-background border-b shadow-sm hover:bg-muted/50">
                <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[50px] sticky left-0 z-0 bg-background">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-muted"
                      >
                        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={handleExpandAll}>
                        <Maximize2 className="mr-2 h-4 w-4" />
                        Expand All
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleCollapseAll}>
                        <Minimize2 className="mr-2 h-4 w-4" />
                        Collapse All
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
                <SortableHeader
                  field="name"
                  label="Task Name"
                  sorts={sorts}
                  onSortChange={handleSort}
                  className="w-[80px] sm:w-[120px] md:w-[220px] sticky left-[50px] z-30 bg-background"
                />
                {/* Project column removed (using grouping instead) */}
                {columnVisibility.description && (
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[150px] sm:w-[200px] bg-background">
                    Description
                  </th>
                )}
                {columnVisibility.assignee && (
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[80px] sm:w-[100px] bg-background">
                    {/* ⚠️ Not sortable — sorting by FK id is meaningless.
                                                Re-enable once assigneeDisplayName is denormalized onto Task. */}
                    Assignee
                  </th>
                )}
                {columnVisibility.reviewer && (
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[80px] sm:w-[100px] bg-background">
                    Reviewer
                  </th>
                )}
                {columnVisibility.status && (
                  <SortableHeader
                    field="status"
                    label="Status"
                    sorts={sorts}
                    onSortChange={handleSort}
                    className="w-[90px] sm:w-[90px]"
                  />
                )}
                {columnVisibility.startDate && (
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[90px] sm:w-[120px] bg-background">
                    Start Date
                  </th>
                )}
                {columnVisibility.dueDate && (
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] sm:w-[120px] bg-background">
                    Due Date
                  </th>
                )}
                {columnVisibility.progress && (
                  <SortableHeader
                    field="deadline"
                    label="Deadline"
                    sorts={sorts}
                    onSortChange={handleSort}
                    className="w-[100px] sm:w-[100px]"
                  />
                )}
                {columnVisibility.tag && (
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[100px] sm:w-[100px] bg-background">
                    Tag
                  </th>
                )}
                <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap w-[40px] bg-background"></th>
              </tr>
            </thead>
            <tbody>
              {mode === "sorted" ? (
                <SortedTaskList
                  sortedTasks={sortedTasks}
                  isLoading={isSortedViewLoading}
                  hasMore={sortedHasMore}
                  isLoadingMore={isLoadingMoreSorted}
                  columnVisibility={columnVisibility}
                  visibleColumnsCount={visibleColumnsCount}
                  onLoadMore={loadMoreSorted}
                  handleSubTaskClick={handleSubTaskClick}
                />
              ) : groupedTasks ? (
                // Sort project IDs to match the order in the 'projects' array (which is server-sorted newest-first)
                orderedWorkspaceProjects
                  .map((project) => {
                    const currentProjectId = project.id;
                    const projectTasks = groupedTasks[currentProjectId];

                    return (
                      <ProjectTaskGroup
                        key={currentProjectId}
                        projectId={currentProjectId}
                        project={project}
                        initialTasks={projectTasks}
                        totalTasksCount={
                          filtersActive
                            ? currentProjectCounts?.[currentProjectId] ||
                            projectTaskCounts[currentProjectId] ||
                            0
                            : projectCounts
                              ? projectCounts[currentProjectId] || 0
                              : projectTaskCounts[currentProjectId]
                        }
                        isExpanded={expandedProjects[currentProjectId] === true}
                        onToggle={() => toggleProjectExpand(currentProjectId)}
                        visibleColumnsCount={visibleColumnsCount}
                        columnVisibility={columnVisibility}
                        expandedTasks={expanded}
                        onToggleExpandTask={toggleExpand}
                        updatingTaskId={updatingTaskId}
                        setUpdatingTaskId={setUpdatingTaskId}
                        permissions={permissions}
                        userId={userId}
                        isWorkspaceAdmin={isWorkspaceAdmin}
                        leadProjectIds={leadProjectIds}
                        projects={projects}
                        projectMap={projectMap}
                        onRequestSubtasks={handleRequestSubtasks}
                        getCachedSubTasks={getCachedSubTasks}
                        tags={tags}
                        scrollContainerRef={scrollContainerRef}
                        members={members}
                        workspaceId={workspaceId}
                        canCreateSubTask={canCreateSubTask}
                        loadingSubTasks={loadingSubTasks}
                        loadingMoreSubTasks={loadingMoreSubTasks}
                        onLoadMoreSubTasks={loadMoreSubTasks}
                        handleSubTaskClick={handleSubTaskClick}
                        level={level}
                        paginationState={projectPagination[currentProjectId]}
                        getObserver={getObserver}
                        filtersActive={filtersActive}
                        activeInlineProjectId={activeInlineProjectId}
                        setActiveInlineProjectId={setActiveInlineProjectId}
                        onEnsureProjectLoad={ensureFilteredProjectLoad}
                        onUpdateParentTaskLists={(updatedProjectTasks) => {
                          // Maintain newest-first: updated tasks should stay in their relative created order.
                          // For simplicity in a flat array, we just update the specific matching tasks in the main list.
                          setTasks((prev) => {
                            const taskMap = new Map(prev.map((t) => [t.id, t]));
                            updatedProjectTasks.forEach((t) =>
                              taskMap.set(t.id, t),
                            );
                            return Array.from(taskMap.values());
                          });
                        }}
                      />
                    );
                  })
              ) : (
                <FlatTaskList
                  initialTasks={tasks}
                  columnVisibility={columnVisibility}
                  visibleColumnsCount={visibleColumnsCount}
                  expandedTasks={expanded}
                  onToggleExpandTask={toggleExpand}
                  updatingTaskId={updatingTaskId}
                  setUpdatingTaskId={setUpdatingTaskId}
                  permissions={permissions}
                  userId={userId}
                  isWorkspaceAdmin={isWorkspaceAdmin}
                  leadProjectIds={leadProjectIds}
                  projects={projects}
                  onRequestSubtasks={handleRequestSubtasks}
                  getCachedSubTasks={getCachedSubTasks}
                  tags={tags}
                  scrollContainerRef={scrollContainerRef}
                  members={members}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  canCreateSubTask={canCreateSubTask}
                  loadingSubTasks={loadingSubTasks}
                  loadingMoreSubTasks={loadingMoreSubTasks}
                  onLoadMoreSubTasks={loadMoreSubTasks}
                  handleSubTaskClick={handleSubTaskClick}
                  level={level}
                  filtersActive={filtersActive}
                  activeInlineProjectId={activeInlineProjectId}
                  setActiveInlineProjectId={setActiveInlineProjectId}
                  onUpdateParentTaskLists={(updatedTasks) => {
                    setTasks(updatedTasks);
                  }}
                />
              )}
              {!groupedTasks && projectPagination[projectId]?.hasMore && (
                <LoadMoreSentinel
                  visibleColumnsCount={visibleColumnsCount}
                  projectId={projectId}
                  observer={getObserver()}
                />
              )}

              {isLoadingFilters && tasks.length === 0 && (
                <TableLoading visibleColumnsCount={visibleColumnsCount} />
              )}

              {mode !== "sorted" &&
                tasks.length === 0 &&
                !isLoadingFilters &&
                !groupedTasks && (
                  <EmptyState
                    message="No tasks found"
                    visibleColumnsCount={visibleColumnsCount}
                  />
                )}

              {/* Global Pagination for Workspace Filtered View */}
              {level === "workspace" &&
                filtersActive &&
                projectPagination["__global_filter__"]?.hasMore && (
                  <LoadMoreSentinel
                    visibleColumnsCount={visibleColumnsCount}
                    projectId="__global_filter__"
                    observer={getObserver()}
                  />
                )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default memo(TaskTable);
