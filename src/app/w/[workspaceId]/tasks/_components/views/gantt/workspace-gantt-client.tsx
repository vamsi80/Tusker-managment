"use client";

import { Loader2 } from "lucide-react";
import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { GanttTask } from "@/components/task/gantt/types";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
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
import type { ProjectMembersType } from "@/data/project/get-project-members";
import { useFilterStore } from "@/lib/store/filter-store";

interface WorkspaceGanttClientProps {
  workspaceId: string;
  initialTasks: GanttTask[];
  allTasks: any[];
  subtaskDataMap: Record<string, any>;
  projects: ProjectOption[];
  members: ProjectMembersType;
  tags: TagOption[];
  projectCounts?: Record<string, number>;
  currentUser: { id: string };
  permissions?: {
    isWorkspaceAdmin: boolean;
    leadProjectIds: string[];
    managedProjectIds: string[];
  };
  isShell?: boolean;
}

export function WorkspaceGanttClient({
  workspaceId,
  initialTasks,
  allTasks,
  subtaskDataMap,
  projects,
  members,
  tags,
  projectCounts,
  currentUser,
  permissions,
  isShell = false,
}: WorkspaceGanttClientProps) {
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
      name: m.user.name || "",
      surname: m.user.surname || "",
      email: m.user.email || "",
    })),
    [members]
  );

  const filteredMembers = useMemo(
    () =>
      toolbarMembers.filter((m) => {
        if (!filters.projectId) return true;
        const project = projects.find((p) => p.id === filters.projectId);
        return (project as any)?.memberIds?.includes(m.id);
      }),
    [toolbarMembers, filters.projectId, projects],
  );

  const [tasks, setTasks] = useState<GanttTask[]>(initialTasks);
  const [nextCursor, setNextCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadingSubtasks, setLoadingSubtasks] = useState<Set<string>>(new Set());
  const fetchingIdsRef = useRef<Set<string>>(new Set());
  const expandedTaskIdsRef = useRef<Set<string>>(new Set());

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
    params.append("l", "30");

    if (isLoadMore && nextCursor) {
        params.append("c", JSON.stringify(nextCursor));
    }

    if (filters.projectId) params.append("p", filters.projectId);
    if (filters.status) params.append("s", filters.status);
    if (filters.assigneeId) params.append("a", filters.assigneeId);
    if (filters.tagId) params.append("t", filters.tagId);
    if (filters.startDate)
      params.append(
        "da",
        filters.startDate instanceof Date
          ? filters.startDate.toISOString()
          : filters.startDate,
      );
    if (filters.endDate)
      params.append(
        "db",
        filters.endDate instanceof Date
          ? filters.endDate.toISOString()
          : filters.endDate,
      );
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
    // 🚿 Clear subtasks and expanded tracking on every filter change
    setTasks(prev => prev.map(t => ({ ...t, subtasks: [] })));
    expandedTaskIdsRef.current.clear();

    const timer = setTimeout(() => {
      startTransition(() => {
        fetchTasks(false);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [workspaceId, filters, searchQuery]);

  const handleLoadMore = () => {
    startTransition(() => {
        fetchTasks(true);
    });
  };

  const handleRequestSubtasks = async (taskId: string) => {
    console.log("[Workspace Gantt] handleRequestSubtasks triggered for:", taskId);
    expandedTaskIdsRef.current.add(taskId);

    // 🧠 Cache Strategy: Bypass cache if any filters are active to ensure data accuracy
    const hasActiveFilters = !!(filters.status || filters.assigneeId || filters.tagId || searchQuery || filters.startDate || filters.endDate);
    
    if (!hasActiveFilters) {
      const cached = useTaskCacheStore.getState().getCachedSubTasks(taskId);
      if (cached && cached.subTasks.length > 0) {
        const transformedSubtasks = transformToGanttTasks(cached.subTasks)[0]?.subtasks || [];
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, subtasks: transformedSubtasks } : t
        ));
        return;
      }
    }

    setLoadingSubtasks(prev => new Set(prev).add(taskId));
    try {
      const params = new URLSearchParams();
      params.set("w", workspaceId);
      params.set("ids", taskId);
      params.set("vm", "gantt");
      params.set("sub", "true");      // 🚀 Signal for subtask expansion fetch
      params.set("hm", "subtasks");  // 🚀 Hierarchy mode for expansion

      // 🎯 Precision Filtering: Pass all current filters to expansion fetch
      if (filters.status) params.append("s", filters.status);
      if (filters.assigneeId) params.append("a", filters.assigneeId);
      if (filters.tagId) params.append("t", filters.tagId);
      if (searchQuery) params.append("q", searchQuery);
      if (filters.projectId) params.append("p", filters.projectId);
      if (filters.startDate) {
        const da = filters.startDate instanceof Date ? filters.startDate.toISOString() : filters.startDate;
        params.append("da", da);
      }
      if (filters.endDate) {
        const db = filters.endDate instanceof Date ? filters.endDate.toISOString() : filters.endDate;
        params.append("db", db);
      }

      const res = await fetch(`/api/v1/tasks?${params.toString()}`);
      const json = await res.json();

      if (json.success && json.data.tasks?.length > 0) {
        // Cache management: only cache results when no filters are active
        if (!hasActiveFilters) {
          const subtasks = json.data.tasks.filter((t: any) => t.id !== taskId);
          useTaskCacheStore.getState().setCachedSubTasks(taskId, {
            subTasks: subtasks,
            hasMore: false
          });
        }

        // 🧬 Transform and update state
        // transformToGanttTasks handles raw flat API response [Parent, Sub1, Sub2] 
        // and returns nested structure [{ id: taskId, subtasks: [...] }]
        const transformed = transformToGanttTasks(json.data.tasks);
        if (transformed.length > 0) {
          const match = transformed.find(t => t.id === taskId);
          setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, subtasks: match?.subtasks || [] } : t
          ));
        }
      } else {
        // Explicitly set empty subtasks if no matching results returned
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, subtasks: [] } : t
        ));
      }
    } catch (err) {
      console.error("Failed to load subtasks:", err);
    } finally {
      setLoadingSubtasks(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const ganttTasks = tasks;

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

  useMemo(() => {
    if (allTasks && allTasks.length > 0) {
      const tasksByProject: Record<string, any[]> = {};
      allTasks.forEach((t) => {
        const pid = t.projectId || "unknown";
        if (!tasksByProject[pid]) tasksByProject[pid] = [];
        tasksByProject[pid].push(t);
      });

      Object.entries(tasksByProject).forEach(([pid, tasks]) => { });
    }
  }, [allTasks]);

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
      // Read directly from store state WITHOUT subscribing the component
      subtaskData = (useTaskCacheStore.getState() as any).entities[subtaskId];
    }
    if (subtaskData) {
      openSubTaskSheet(subtaskData);
    }
  };

  // 🧹 Filter Reset Logic: Ensures a clean slate when navigating between different views
  // Persists filters during forward routing within the same project/view.
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
          tasks={ganttTasks}
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
          loadingSubtasks={loadingSubtasks}
          isLoading={isLoadingMore || isPending}
        />
      </div>
    </div>
  );
}
