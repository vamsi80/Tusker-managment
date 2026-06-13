"use client";

import { Loader2 } from "lucide-react";
import { useState, useMemo, useTransition, useEffect, useRef, useCallback } from "react";
import { GanttTask } from "@/components/task/gantt/types";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { transformToGanttTasks, transformToGanttSubtasks, type RawTaskInput } from "@/components/task/gantt/transform-tasks";
import { GlobalFilterToolbar } from "@/components/task/shared/global-filter-toolbar";
import {
  ProjectOption,
  MemberOption,
  TaskFilters,
  TagOption,
} from "@/components/task/shared/types";
import { toast } from "sonner";

import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";
import { ProjectMembersType } from "@/types/project";
import type { WorkspaceTaskType } from "@/types/task";
import { useFilterStore } from "@/lib/store/filter-store";
import { useWorkspaceLayout } from "../../../../_components/workspace-layout-context";
import { useProjectTags } from "@/hooks/use-project-tags";
import { useFilteredFetch } from "@/hooks/use-filtered-fetch";
import { taskViewUrl } from "@/lib/api-client/task-views";

interface WorkspaceGanttClientProps {
  workspaceId: string;
  initialTasks: GanttTask[];
  allTasks: WorkspaceTaskType[];
  subtaskDataMap: Record<string, WorkspaceTaskType>;
  members: ProjectMembersType;
  projectCounts?: Record<string, number>;
  currentUser: { id: string };
  isShell?: boolean;
}

export function WorkspaceGanttClient({
  workspaceId,
  initialTasks,
  allTasks,
  subtaskDataMap,
  members,
  projectCounts,
  currentUser,
  isShell = false,
}: WorkspaceGanttClientProps) {
  const { data: layoutData } = useWorkspaceLayout();
  const projects = layoutData.projects || [];
  const permissions = layoutData.permissions;
  const { filters, setFilters, searchQuery, setSearchQuery, clearFilters } = useFilterStore();
  const tags = useProjectTags(workspaceId, filters.projectId);

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (p) =>
          !filters.assigneeId ||
          (p.memberIds && p.memberIds.includes(filters.assigneeId)),
      ),
    [projects, filters.assigneeId],
  );

  // Convert full ProjectMembersType to flat MemberOption[] only for the toolbar
  const toolbarMembers = useMemo<MemberOption[]>(
    () => members.map(m => ({
      id: m.userId,
      surname: m.user.surname || "",
    })),
    [members]
  );

  const filteredMembers = useMemo(
    () =>
      toolbarMembers.filter((m) => {
        if (!filters.projectId) return true;
        const project = projects.find((p) => p.id === filters.projectId);
        return project?.memberIds?.includes(m.id);
      }),
    [toolbarMembers, filters.projectId, projects],
  );
  const [isPending, startTransition] = useTransition();
  const lastFiltersActiveRef = useRef(false);

  const [tasks, setTasks] = useState<GanttTask[]>(initialTasks);
  const [localTaskDataMap, setLocalTaskDataMap] = useState<Record<string, WorkspaceTaskType>>(subtaskDataMap);
  const [loadingSubtasks, setLoadingSubtasks] = useState<Set<string>>(new Set());
  const [loadingProjects, setLoadingProjects] = useState<Set<string>>(new Set());
  const fetchingIdsRef = useRef<Set<string>>(new Set());
  const fetchingSubtasksRef = useRef<Set<string>>(new Set());
  const expandedTaskIdsRef = useRef<Set<string>>(new Set());

  const onFilteredResults = useCallback((newRawTasks: WorkspaceTaskType[]) => {
    const newGanttTasks = transformToGanttTasks(newRawTasks as RawTaskInput[]);
    setTasks(newGanttTasks);
    setLocalTaskDataMap(prev => {
      const next = { ...prev };
      newRawTasks.forEach((t) => {
        next[t.id] = t;
      });
      return next;
    });
  }, []);

  const onAppendFilteredResults = useCallback((newRawTasks: WorkspaceTaskType[]) => {
    const newGanttTasks = transformToGanttTasks(newRawTasks as RawTaskInput[]);
    setTasks(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      const uniqueNew = newGanttTasks.filter(t => !existingIds.has(t.id));
      return [...prev, ...uniqueNew];
    });
    setLocalTaskDataMap(prev => {
      const next = { ...prev };
      newRawTasks.forEach((t) => {
        next[t.id] = t;
      });
      return next;
    });
  }, []);

  const {
    isLoading: isFilteredLoading,
    loadMore: loadMoreFiltered,
    pagination: filterPagination,
    filtersActive
  } = useFilteredFetch({
    workspaceId,
    level: "workspace",
    viewMode: "gantt",
    onResults: onFilteredResults,
    onAppendResults: onAppendFilteredResults,
  });

  // 🔑 Force GanttChart to reset its internal expansion state when filters change
  const filterKey = useMemo(() =>
    JSON.stringify({
      filters,
      searchQuery,
      workspaceId
    }),
    [filters, searchQuery, workspaceId]
  );

  // 🧹 RESTORE Logic: When filters are cleared, restore the original hierarchical view
  useEffect(() => {
    if (!filtersActive && lastFiltersActiveRef.current) {
      setTasks(initialTasks);
      setLocalTaskDataMap(subtaskDataMap);
      lastFiltersActiveRef.current = false;
    } else if (filtersActive) {
      lastFiltersActiveRef.current = true;
    }
  }, [filtersActive, initialTasks, subtaskDataMap]);

  const handleLoadMore = () => {
    if (filtersActive) {
      loadMoreFiltered();
    }
  };

  const batchQueueRef = useRef<string[]>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleRequestSubtasks = (taskId: string) => {
    if (fetchingIdsRef.current.has(taskId)) return;

    // 🚀 BUFFER: Add to queue and schedule flush
    if (!batchQueueRef.current.includes(taskId)) {
      batchQueueRef.current.push(taskId);
    }

    if (!batchTimerRef.current) {
      batchTimerRef.current = setTimeout(() => {
        flushSubtaskBatch();
      }, 80); // Small 80ms window to catch 'Expand All' or scrolling bursts
    }
  };

  const flushSubtaskBatch = async () => {
    const idsToFetch = [...batchQueueRef.current];
    batchQueueRef.current = [];
    batchTimerRef.current = null;

    if (idsToFetch.length === 0) return;

    // 1. Mark as loading immediately
    idsToFetch.forEach(id => fetchingIdsRef.current.add(id));
    setLoadingSubtasks(prev => {
      const next = new Set(prev);
      idsToFetch.forEach(id => next.add(id));
      return next;
    });

    try {
      // 🚀 BATCH API: Fetch multiple expansions in one POST request
      const response = await fetch(`/api/v1/tasks/expansion/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: idsToFetch,
          workspaceId,
          projectId: filters.projectId,
          viewMode: "gantt",
          pageSize: 30,
          filters: {
            status: filters.status,
            assigneeId: filters.assigneeId,
            tagId: filters.tagId,
            search: searchQuery,
            dueAfter: filters.startDate ? new Date(filters.startDate).toISOString() : undefined,
            dueBefore: filters.endDate ? new Date(filters.endDate).toISOString() : undefined,
            dueDateType: filters.dueDateFilter
          }
        })
      });

      const json = await response.json();

      if (json.success && Array.isArray(json.data)) {
        // 2. Process all results
        const newLocalData: Record<string, WorkspaceTaskType> = {};

        setTasks(prev => {
          let updatedTasks = [...prev];

          json.data.forEach((batchResult: { parentTaskId: string; subTasks: WorkspaceTaskType[]; hasMore: boolean; nextCursor: string | null }) => {
            const tid = batchResult.parentTaskId;
            const subTasks = batchResult.subTasks || [];

            // Collect for local map
            subTasks.forEach((st) => {
              newLocalData[st.id] = st;
            });

            const transformed = transformToGanttSubtasks(subTasks as RawTaskInput[]);

            updatedTasks = updatedTasks.map(t =>
              t.id === tid ? {
                ...t,
                subtasks: transformed,
                hasMoreSubtasks: batchResult.hasMore,
                subtaskCursor: batchResult.nextCursor
              } : t
            );
          });

          return updatedTasks;
        });

        // 3. Hydrate local data map
        setLocalTaskDataMap(prev => ({ ...prev, ...newLocalData }));
      }
    } catch (err) {
      console.error("[Workspace Gantt] Batch expansion failed:", err);
      // Fallback: Clear loading state for these IDs so they can be retried
      setTasks(prev => prev.map(t =>
        idsToFetch.includes(t.id) ? { ...t, subtasks: undefined } : t
      ));
    } finally {
      idsToFetch.forEach(id => fetchingIdsRef.current.delete(id));
      setLoadingSubtasks(prev => {
        const next = new Set(prev);
        idsToFetch.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  // 🚀 NEW: Project Expansion Batch Loading 
  const handleRequestProjectTasks = async (projectId: string) => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    if (projectTasks.length === 0) {
      setLoadingProjects(prev => new Set(prev).add(projectId));

      try {
        const res = await fetch(taskViewUrl("gantt", workspaceId, projectId));
        const json = await res.json();
        if (json.success && json.data?.tasks) {
          const newTasks = transformToGanttTasks(json.data.tasks);
          setTasks(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const uniqueNew = newTasks.filter(t => !existingIds.has(t.id));
            return [...prev, ...uniqueNew];
          });
        }
      } catch (err) {
        console.error("Failed to fetch project tasks on expansion:", err);
      } finally {
        setLoadingProjects(prev => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
      }
    }
  };

  /**
   * 🚀 NEW: handleRequestMoreSubtasks
   * Fetches the next page of subtasks for a specific parent task.
   */
  const handleRequestMoreSubtasks = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.hasMoreSubtasks || fetchingSubtasksRef.current.has(taskId)) return;

    fetchingSubtasksRef.current.add(taskId);
    setLoadingSubtasks(prev => new Set(prev).add(taskId));

    try {
      const params = new URLSearchParams({
        parent: taskId,    // 🚀 Parent filter (List view pattern)
        limit: "30",       // 🚀 Matches List view pagination
      });

      if (task.subtaskCursor) {
        params.set("cursor", JSON.stringify(task.subtaskCursor));
      }

      if (filters.status) params.append("status", JSON.stringify(filters.status));
      if (filters.assigneeId) params.append("assignee", JSON.stringify(filters.assigneeId));
      if (filters.tagId) params.append("tag", JSON.stringify(filters.tagId));
      if (filters.dueDateFilter) params.append("dueDateType", filters.dueDateFilter);
      if (searchQuery) params.append("search", searchQuery);
      if (filters.startDate) params.set("dueAfter", new Date(filters.startDate).toISOString());
      if (filters.endDate) params.set("dueBefore", new Date(filters.endDate).toISOString());

      const res = await fetch(`${taskViewUrl("gantt", workspaceId)}?${params.toString()}`);
      const json = await res.json();

      if (json.success && json.data) {
        const result = json.data;
        const rawSubtasks: WorkspaceTaskType[] = result.tasks || [];
        setTasks(prev => {
          const next = [...prev];
          const idx = next.findIndex(t => t.id === taskId);
          if (idx !== -1) {
            const currentSubtasks = next[idx].subtasks || [];
            const newSubtasks = transformToGanttSubtasks(rawSubtasks as RawTaskInput[]);

            // Deduplicate subtasks by ID to prevent UI glitches
            const existingIds = new Set(currentSubtasks.map(s => s.id));
            const uniqueNew = newSubtasks.filter(s => !existingIds.has(s.id));

            next[idx] = {
              ...next[idx],
              subtasks: [...currentSubtasks, ...uniqueNew],
              hasMoreSubtasks: result.hasMore,
              subtaskCursor: result.nextCursor
            };
          }
          return next;
        });

        // 🚀 Hydrate local map with more subtasks
        setLocalTaskDataMap(prev => {
          const next = { ...prev };
          rawSubtasks.forEach((st) => {
            next[st.id] = st;
          });
          return next;
        });
      }
    } catch (err) {
      console.error("[Workspace Gantt] Load more subtasks failed:", err);
    } finally {
      fetchingSubtasksRef.current.delete(taskId);
      setLoadingSubtasks(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleFilterChange = (newFilters: TaskFilters) => {
    startTransition(() => {
      setFilters(newFilters);
    });
  };

  const handleSearchChange = (query: string) => {
    startTransition(() => {
      setSearchQuery(query);
    });
  };


  const { openSubTaskSheet } = useSubTaskSheetActions();



  const handleSubtaskClick = (subtaskId: string) => {
    console.log("💎💎💎 [WorkspaceGanttClient] handleSubtaskClick CALLED with ID:", subtaskId);

    // 1. Try local data map first (it should have hydrated metadata)
    let subtaskData = localTaskDataMap[subtaskId];

    if (subtaskData) {
      console.log("[WorkspaceGanttClient] Task found in local map, calling openSubTaskSheet...");
      openSubTaskSheet(subtaskData);
    } else {
      console.warn("[WorkspaceGanttClient] Task data not found in local map. ID:", subtaskId, "Map Size:", Object.keys(localTaskDataMap).length);
      toast.error("Task details not found. Try refreshing.");
    }
  };

  useEffect(() => {
    return () => {
      clearFilters();
    };
  }, [clearFilters, workspaceId]);

  // ---------------------------------------------------------------------------
  // 🚀 REALTIME SYNC: Listen for Pusher-driven structural mutations
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleRealtimeSync = (e: Event) => {
      const { action, record } = (e as CustomEvent).detail || {};
      if (!action || !record) return;

      if (action === "TASK_CREATED" && !record.parentTaskId) {
        const newGanttTask = transformToGanttTasks([record]);
        if (newGanttTask.length === 0) return;

        setTasks((prev) => {
          if (prev.some((t) => t.id === record.id)) return prev;
          return [...prev, ...newGanttTask];
        });
      }

      if (action === "TASK_DELETED" && !record.parentTaskId) {
        setTasks((prev) => prev.filter((t) => t.id !== record.id));
      }

      if (action === "TASK_UPDATED" && !record.parentTaskId) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === record.id ? { ...t, ...transformToGanttTasks([record])[0] } : t,
          ),
        );
      }

      if (action === "SUBTASK_CREATED" && record.parentTaskId) {
        const newSubtask = transformToGanttSubtasks([record]);
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== record.parentTaskId) return t;
            const updatedSubtasks = t.subtasks
              ? t.subtasks.some((s) => s.id === record.id)
                ? t.subtasks
                : [...t.subtasks, ...newSubtask]
              : t.subtasks; // Don't inject if subtasks not yet loaded (undefined)
            return {
              ...t,
              subtasks: updatedSubtasks,
              subtaskCount: (t.subtaskCount || 0) + 1,
            };
          }),
        );
      }

      if (action === "SUBTASK_DELETED" && record.parentTaskId) {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== record.parentTaskId) return t;
            return {
              ...t,
              subtasks: t.subtasks?.filter((s) => s.id !== record.id),
              subtaskCount: Math.max(0, (t.subtaskCount || 0) - 1),
            };
          }),
        );
      }

      if (action === "SUBTASK_UPDATED" && record.parentTaskId) {
        const updatedSubtask = transformToGanttSubtasks([record]);
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== record.parentTaskId) return t;
            return {
              ...t,
              subtasks: t.subtasks?.map((s) =>
                s.id === record.id ? { ...s, ...updatedSubtask[0] } : s,
              ),
            };
          }),
        );
      }
    };

    window.addEventListener("realtime-sync-refresh", handleRealtimeSync);
    return () => window.removeEventListener("realtime-sync-refresh", handleRealtimeSync);
  }, [workspaceId]);

  return (
    <div className="space-y-4">
      <GlobalFilterToolbar
        level="workspace"
        view="gantt"
        filters={filters}
        searchQuery={searchQuery}
        members={filteredMembers}
        projects={filteredProjects}
        tags={tags}
        onFilterChange={handleFilterChange}
        onSearchChange={handleSearchChange}
        onClearAll={() => {
          startTransition(() => {
            clearFilters();
          });
        }}
      />
      <div className="relative min-h-[400px]">
        {isPending && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm transition-all duration-300">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-8 animate-spin text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                Filtering...
              </span>
            </div>
          </div>
        )}
        <GanttChart
          key={filterKey}
          workspaceId={workspaceId}
          tasks={tasks}
          showProjectFilter={true}
          projects={filteredProjects}
          selectedProjectId={filters.projectId}
          onProjectChange={(projectId) => {
            handleFilterChange({
              ...filters,
              projectId: projectId || undefined,
            });
          }}
          groupByProject={true}
          onSubtaskClick={handleSubtaskClick}
          onSubTaskUpdate={(subTaskId, data) => {
            setTasks(prev =>
              prev.map(t =>
                t.id === subTaskId
                  ? { ...t, ...data } as GanttTask
                  : {
                    ...t,
                    subtasks: t.subtasks?.map(s =>
                      s.id === subTaskId ? { ...s, ...data } : s
                    )
                  } as GanttTask
              )
            );
          }}
          projectCounts={projectCounts}
          members={members}
          currentUser={currentUser}
          permissions={permissions}
          hasMore={filtersActive ? filterPagination.hasMore : false}
          onLoadMore={handleLoadMore}
          onRequestSubtasks={handleRequestSubtasks}
          onRequestMoreSubtasks={handleRequestMoreSubtasks} // 🚀 NEW: Pass handler
          onRequestProjectTasks={handleRequestProjectTasks}
          loadingSubtasks={loadingSubtasks}
          loadingProjects={loadingProjects}
          isLoading={isFilteredLoading || isPending}
        />
      </div>
    </div>
  );
}
