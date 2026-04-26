"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { GanttTask } from "../../../../../../../components/task/gantt/types";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import type { WorkspaceTaskType } from "@/data/task";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { GlobalFilterToolbar } from "@/components/task/shared/global-filter-toolbar";
import { TagOption, TaskFilters } from "@/components/task/shared/types";
import { transformToGanttTasks, transformToGanttSubtasks } from "@/components/task/gantt/transform-tasks";
import { ProjectMembersType } from "@/types/project";
import { useFilterStore } from "@/lib/store/filter-store";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { toast } from "sonner";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { ProjectOption } from "@/components/task/shared/types";
import { workspacesClient } from "@/lib/api-client/workspaces";

interface ProjectGanttClientProps {
    workspaceId: string;
    projectId: string;
    initialTasks: GanttTask[];
    allTasks: any[];
    subtaskDataMap: Record<string, WorkspaceTaskType>;
    members: ProjectMembersType;
    projectCounts?: Record<string, number>;
    currentUser?: { id: string };
    isShell?: boolean;
}

export function ProjectGanttClient({
    workspaceId,
    projectId,
    initialTasks,
    subtaskDataMap,
    members,
    projectCounts,
    currentUser,
}: ProjectGanttClientProps) {
    const { data: layoutData } = useWorkspaceLayout();
    const permissions = layoutData.permissions;
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
                console.error("Failed to fetch tags for ProjectGanttClient:", error);
            }
        };
        fetchTags();
        return () => {
            mounted = false;
        };
    }, [workspaceId]);

    const { filters, setFilters, searchQuery, setSearchQuery, clearFilters } = useFilterStore();
    const [isPending, startTransition] = useTransition();

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    // Handle subtask click
    const handleSubtaskClick = (subtaskId: string) => {
        const subtaskData = subtaskDataMap[subtaskId] || useTaskCacheStore.getState().entities[subtaskId];
        if (subtaskData) {
            openSubTaskSheet(subtaskData);
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

    // 🧹 Filter Reset Logic: Ensures a clean slate when navigating between different views
    useEffect(() => {
        return () => {
            clearFilters();
        };
    }, [clearFilters, workspaceId, projectId]);

    const [tasks, setTasks] = useState<GanttTask[]>(initialTasks);
    const [nextCursor, setNextCursor] = useState<any>(null);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
    const [loadingSubtasks, setLoadingSubtasks] = useState<Set<string>>(new Set());
    const fetchingIdsRef = useRef<Set<string>>(new Set());
    const fetchingSubtasksRef = useRef<Set<string>>(new Set()); // 🚀 NEW: Per-task lock for infinite scroll
    const expandedTaskIdsRef = useRef<Set<string>>(new Set());

    // 🔑 Force GanttChart to reset its internal expansion state when filters change
    const filterKey = useMemo(() =>
        JSON.stringify({
            filters,
            searchQuery,
            workspaceId,
            projectId
        }),
        [filters, searchQuery, workspaceId, projectId]
    );

    const fetchTasks = async (isLoadMore = false): Promise<void> => {
        if (isLoadMore && (!hasMore || isLoadingMore)) return;

        const params = new URLSearchParams();
        params.append("w", workspaceId);
        params.append("p", projectId);
        params.append("vm", "gantt");
        params.append("hm", "parents"); // Only fetch root tasks
        params.append("sub", "false"); // 🚀 True lazy loading: exclude subtasks in root fetch
        params.append("l", "50"); // 🔋 Reverted to 50 for faster initial response

        if (isLoadMore && nextCursor) {
            params.append("c", JSON.stringify(nextCursor));
        }

        if (filters.status) params.append("s", filters.status);
        if (filters.assigneeId) params.append("a", filters.assigneeId);
        if (filters.tagId) params.append("t", filters.tagId);
        if (filters.startDate) params.append("da", filters.startDate instanceof Date ? filters.startDate.toISOString() : filters.startDate);
        if (filters.endDate) params.append("db", filters.endDate instanceof Date ? filters.endDate.toISOString() : filters.endDate);
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

                // For Gantt, we might need some date formatting logic or just use as is
                // We'll transform these into GanttTasks
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
        // 🚿 Clear subtasks and expanded tracking on every filter change
        setTasks(prev => prev.map(t => ({ ...t, subtasks: undefined })));
        expandedTaskIdsRef.current.clear();

        const timer = setTimeout(() => {
            startTransition(() => {
                fetchTasks(false);
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [workspaceId, projectId, filters, searchQuery]);

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

        // 🧠 Cache Strategy: Bypass cache if any filters are active
        const hasActiveFilters = !!(filters.status || filters.assigneeId || filters.tagId || searchQuery || filters.startDate || filters.endDate);

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
            params.set("p", projectId);
            params.set("ids", taskId);
            params.set("vm", "gantt");
            params.set("ps", "30"); // 🚀 Matches List view initial expansion

            if (filters.status) params.append("s", JSON.stringify(filters.status));
            if (filters.assigneeId) params.append("a", JSON.stringify(filters.assigneeId));
            if (filters.tagId) params.append("t", JSON.stringify(filters.tagId));
            if (searchQuery) params.append("q", searchQuery);

            if (filters.startDate) {
                const da = filters.startDate instanceof Date ? filters.startDate.toISOString() : filters.startDate;
                params.append("da", da);
            }
            if (filters.endDate) {
                const db = filters.endDate instanceof Date ? filters.endDate.toISOString() : filters.endDate;
                params.append("db", db);
            }

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
            console.error("[Project Gantt] Expansion failed for:", taskId, err);
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
                p: projectId,
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

                        // Deduplicate subtasks by ID
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
            console.error("[Project Gantt] Load more subtasks failed:", err);
        } finally {
            fetchingSubtasksRef.current.delete(taskId);
            setLoadingSubtasks(prev => {
                const next = new Set(prev);
                next.delete(taskId);
                return next;
            });
        }
    };

    // Surgical update for subtasks (e.g. assignee change)
    const handleSubTaskUpdate = (subTaskId: string, updatedData: Partial<any>) => {
        setTasks(prevTasks => {
            return prevTasks.map(task => {
                // If the updated task is a parent task
                if (task.id === subTaskId) {
                    return { ...task, ...updatedData };
                }

                // If it's a subtask within a parent task
                if (task.subtasks) {
                    const hasSubtask = task.subtasks.find(s => s.id === subTaskId);
                    if (hasSubtask) {
                        return {
                            ...task,
                            subtasks: task.subtasks.map(s =>
                                s.id === subTaskId ? { ...s, ...updatedData } : s
                            )
                        };
                    }
                }
                return task;
            });
        });
    };

    const ganttTasks = tasks;

    // Transform full member objects for the toolbar dropdowns
    const toolbarMembers = members.map(m => ({
        id: m.userId,
        surname: m.user.surname || '',
    }));

    return (
        <div className="space-y-4">
            <GlobalFilterToolbar
                level="project"
                view="gantt"
                filters={filters}
                searchQuery={searchQuery}
                members={toolbarMembers as any}
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
                            <span className="text-sm font-medium text-muted-foreground">Filtering...</span>
                        </div>
                    </div>
                )}
                <GanttChart
                    key={filterKey}
                    tasks={ganttTasks}
                    workspaceId={workspaceId}
                    projectId={projectId}
                    onSubtaskClick={handleSubtaskClick}
                    onSubTaskUpdate={handleSubTaskUpdate}
                    projects={projects}
                    projectCounts={projectCounts}
                    members={members}
                    currentUser={currentUser}
                    permissions={permissions}
                    onLoadMore={handleLoadMore}
                    onRequestSubtasks={handleRequestSubtasks}
                    onRequestMoreSubtasks={handleRequestMoreSubtasks} // 🚀 NEW: Pass handler
                    loadingSubtasks={loadingSubtasks}
                    isLoading={isLoadingMore || isPending}
                />
            </div>
        </div>
    );
}
