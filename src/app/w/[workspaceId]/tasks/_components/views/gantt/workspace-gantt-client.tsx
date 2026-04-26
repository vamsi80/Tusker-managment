"use client";

import { Loader2 } from "lucide-react";
import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { GanttTask } from "@/components/task/gantt/types";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { transformToGanttTasks, transformToGanttSubtasks } from "@/components/task/gantt/transform-tasks";
import { GlobalFilterToolbar } from "@/components/task/shared/global-filter-toolbar";
import {
  ProjectOption,
  MemberOption,
  TaskFilters,
  TagOption,
} from "@/components/task/shared/types";
import { toast } from "sonner";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";
import { ProjectMembersType } from "@/types/project";
import { useFilterStore } from "@/lib/store/filter-store";
import { useWorkspaceLayout } from "../../../../_components/workspace-layout-context";
import { workspacesClient } from "@/lib/api-client/workspaces";

interface WorkspaceGanttClientProps {
  workspaceId: string;
  initialTasks: GanttTask[];
  allTasks: any[];
  subtaskDataMap: Record<string, any>;
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
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const permissions = layoutData.permissions;

  useEffect(() => {
    let mounted = true;
    const fetchTags = async () => {
      try {
        const workspaceTags = await workspacesClient.getTags(workspaceId);
        if (mounted) {
          setTags(workspaceTags.map((t) => ({ id: t.id, name: t.name })));
        }
      } catch (error) {
        console.error("Failed to fetch tags for WorkspaceGanttClient:", error);
      }
    };
    fetchTags();
    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  const { filters, setFilters, searchQuery, setSearchQuery, clearFilters } = useFilterStore();
  const [isPending, startTransition] = useTransition();

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (p: any) =>
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
        const project = projects.find((p: any) => p.id === filters.projectId);
        return (project as any)?.memberIds?.includes(m.id);
      }),
    [toolbarMembers, filters.projectId, projects],
  );

  const [tasks, setTasks] = useState<GanttTask[]>(initialTasks);
  const [nextCursor, setNextCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadingSubtasks, setLoadingSubtasks] = useState<Set<string>>(new Set());
  const [loadingProjects, setLoadingProjects] = useState<Set<string>>(new Set());
  const fetchingIdsRef = useRef<Set<string>>(new Set());
  const fetchingSubtasksRef = useRef<Set<string>>(new Set()); // 🚀 NEW: Per-task lock for infinite scroll
  const expandedTaskIdsRef = useRef<Set<string>>(new Set());
  const hasFetchedRef = useRef(false);

  // 🔑 Force GanttChart to reset its internal expansion state when filters change
  const filterKey = useMemo(() =>
    JSON.stringify({
      filters,
      searchQuery,
      workspaceId
    }),
    [filters, searchQuery, workspaceId]
  );

  const fetchTasks = async (isLoadMore = false): Promise<void> => {
    if (isLoadMore && (!hasMore || isLoadingMore)) return;

    const params = new URLSearchParams();
    params.append("w", workspaceId);
    params.append("vm", "gantt");
    params.append("hm", "parents");
    params.append("sub", "false"); // 🚀 True lazy loading: exclude subtasks in root fetch
    params.append("l", "50"); // 🔋 Reverted to 50 for faster initial response

    if (isLoadMore && nextCursor) {
      params.append("c", JSON.stringify(nextCursor));
    }

    if (filters.projectId) params.append("p", filters.projectId);
    if (filters.status) params.append("s", filters.status);
    if (filters.assigneeId) params.append("a", filters.assigneeId);
    if (filters.tagId) params.append("t", filters.tagId);
    if (searchQuery) params.append("q", searchQuery);

    const fetchKey = `gantt-fetch-${params.toString()}`;
    if (fetchingIdsRef.current.has(fetchKey)) return;
    fetchingIdsRef.current.add(fetchKey);

    if (isLoadMore) setIsLoadingMore(true);

    try {
      const res = await fetch(`/api/v1/tasks?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        const result = json.data;
        const newRawTasks = result.tasks || [];
        const newGanttTasks = transformToGanttTasks(newRawTasks);

        setTasks(prev => {
          if (!isLoadMore) return newGanttTasks;
          const existingIds = new Set(prev.map(t => t.id));
          const uniqueNew = newGanttTasks.filter(t => !existingIds.has(t.id));
          return [...prev, ...uniqueNew];
        });
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
        lastFetchTimeRef.current = Date.now(); // Track last successful fetch
      }
    } catch (err) {
      console.error("Failed to fetch gantt tasks:", err);
      toast.error("Failed to load tasks");
    } finally {
      fetchingIdsRef.current.delete(fetchKey);
      if (isLoadMore) setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    // 🛡️ Mount Guard: If we have initial data and filters are neutral, skip the first fetch
    const isNeutral = !searchQuery &&
      Object.values(filters).every(v => v === undefined || v === "" || (Array.isArray(v) && v.length === 0));

    if (!hasFetchedRef.current && initialTasks.length > 0 && isNeutral) {
      hasFetchedRef.current = true;
      return;
    }

    // 🚿 Clear subtasks and expanded tracking on every filter change
    setTasks(prev => prev.map(t => ({ ...t, subtasks: undefined })));
    expandedTaskIdsRef.current.clear();

    const timer = setTimeout(() => {
      startTransition(() => {
        fetchTasks(false);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [workspaceId, filters, searchQuery]);

  const lastFetchTimeRef = useRef(0);

  const handleLoadMore = () => {
    // 🛡️ Guard: Prevent overlapping fetches or too-frequent pagination triggers
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 2000) return; // 2s cooldown for pagination
    
    startTransition(() => {
      fetchTasks(true);
    });
  };

  const handleRequestSubtasks = async (taskId: string) => {
    if (fetchingIdsRef.current.has(taskId)) return;
    
    const hasActiveFilters = !!(filters.status || filters.assigneeId || filters.tagId || searchQuery);
    if (!hasActiveFilters) {
      const cached = useTaskCacheStore.getState().getCachedSubTasks(taskId);
      if (cached && cached.subTasks.length > 0) {
        const transformedSubtasks = transformToGanttSubtasks(cached.subTasks);
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, subtasks: transformedSubtasks } : t
        ));
        return;
      }
    }

    fetchingIdsRef.current.add(taskId);
    setLoadingSubtasks(prev => new Set(prev).add(taskId));

    try {
      const params = new URLSearchParams();
      params.set("w", workspaceId);
      params.set("ids", taskId);
      params.set("vm", "gantt");
      params.set("ps", "30"); // 🚀 Matches List view initial expansion

      if (filters.status) params.append("s", JSON.stringify(filters.status));
      if (filters.assigneeId) params.append("a", JSON.stringify(filters.assigneeId));
      if (filters.tagId) params.append("t", JSON.stringify(filters.tagId));
      if (searchQuery) params.append("q", searchQuery);
      if (filters.startDate) params.set("da", new Date(filters.startDate).toISOString());
      if (filters.endDate) params.set("db", new Date(filters.endDate).toISOString());

      const fetchUrl = `/api/v1/tasks/expansion/batch?${params.toString()}`;
      const res = await fetch(fetchUrl);
      const json = await res.json();

      if (json.success && json.data?.length > 0) {
        const batchResult = json.data[0];
        const subTasks = batchResult.subTasks || [];

        if (!hasActiveFilters) {
          useTaskCacheStore.getState().setCachedSubTasks(taskId, {
            subTasks: subTasks,
            hasMore: batchResult.hasMore,
            nextCursor: batchResult.nextCursor
          });
        }

        const transformedSubtasks = transformToGanttSubtasks(subTasks);
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { 
            ...t, 
            subtasks: transformedSubtasks,
            hasMoreSubtasks: batchResult.hasMore,
            subtaskCursor: batchResult.nextCursor
          } : t
        ));
      } else {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, subtasks: [], hasMoreSubtasks: false } : t
        ));
      }
    } catch (err) {
      console.error("[Workspace Gantt] Expansion failed for:", taskId, err);
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, subtasks: undefined } : t
      ));
    } finally {
      fetchingIdsRef.current.delete(taskId);
      setLoadingSubtasks(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  // 🚀 NEW: Project Expansion Batch Loading 
  const handleRequestProjectTasks = async (projectId: string) => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    if (projectTasks.length === 0) {
       setLoadingProjects(prev => new Set(prev).add(projectId));
       const params = new URLSearchParams();
       params.set("w", workspaceId);
       params.set("p", projectId);
       params.set("vm", "gantt");
       params.set("hm", "parents");
       params.set("sub", "false"); 
       
       try {
         const res = await fetch(`/api/v1/tasks?${params.toString()}`);
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
        w: workspaceId,
        vm: "gantt",
        pt: taskId,    // 🚀 Parent filter (List view pattern)
        l: "30",       // 🚀 Matches List view pagination
        sub: "false"
      });

      if (task.subtaskCursor) {
         params.set("c", JSON.stringify(task.subtaskCursor));
      }

      if (filters.status) params.append("s", JSON.stringify(filters.status));
      if (filters.assigneeId) params.append("a", JSON.stringify(filters.assigneeId));
      if (filters.tagId) params.append("t", JSON.stringify(filters.tagId));
      if (searchQuery) params.append("q", searchQuery);
      if (filters.startDate) params.set("da", new Date(filters.startDate).toISOString());
      if (filters.endDate) params.set("db", new Date(filters.endDate).toISOString());

      const res = await fetch(`/api/v1/tasks?${params.toString()}`);
      const json = await res.json();

      if (json.success && json.data) {
        const result = json.data;
        const rawSubtasks = result.tasks || [];
        setTasks(prev => {
          const next = [...prev];
          const idx = next.findIndex(t => t.id === taskId);
          if (idx !== -1) {
            const currentSubtasks = next[idx].subtasks || [];
            const newSubtasks = transformToGanttSubtasks(rawSubtasks);
            
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

  const setProjectTasksCache = useTaskCacheStore(
    (state) => state.setProjectTasksCache,
  );
  const { openSubTaskSheet } = useSubTaskSheetActions();

  useEffect(() => {
    if (allTasks && allTasks.length > 0) {
      const tasksByProject: Record<string, any[]> = {};
      allTasks.forEach((t) => {
        const pid = t.projectId || "unknown";
        if (!tasksByProject[pid]) tasksByProject[pid] = [];
        tasksByProject[pid].push(t);
      });

      Object.entries(tasksByProject).forEach(([pid, tasks]) => {
        setProjectTasksCache(pid, {
          tasks: tasks,
          hasMore: false,
          page: 1,
          totalCount: tasks.length,
        });
      });
    }
  }, [allTasks, setProjectTasksCache]);

  const handleSubtaskClick = (subtaskId: string) => {
    let subtaskData = subtaskDataMap[subtaskId];
    if (!subtaskData) {
      subtaskData = (useTaskCacheStore.getState() as any).entities[subtaskId];
    }
    if (subtaskData) {
      openSubTaskSheet(subtaskData);
    }
  };

  useEffect(() => {
    return () => {
      clearFilters();
    };
  }, [clearFilters, workspaceId]);

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
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                  ? { ...t, ...data }
                  : {
                    ...t,
                    subtasks: t.subtasks?.map(s =>
                      s.id === subTaskId ? { ...s, ...data } : s
                    )
                  }
              )
            );
          }}
          projectCounts={projectCounts}
          members={members}
          currentUser={currentUser}
          permissions={permissions}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onRequestSubtasks={handleRequestSubtasks}
          onRequestMoreSubtasks={handleRequestMoreSubtasks} // 🚀 NEW: Pass handler
          onRequestProjectTasks={handleRequestProjectTasks}
          loadingSubtasks={loadingSubtasks}
          loadingProjects={loadingProjects}
          isLoading={isLoadingMore || isPending}
        />
      </div>
    </div>
  );
}
