"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { GanttTask } from "../../../../../../../components/task/gantt/types";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import type { WorkspaceTaskType } from "@/data/task";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { GlobalFilterToolbar } from "@/components/task/shared/global-filter-toolbar";
import { MemberOption, TagOption, TaskFilters } from "@/components/task/shared/types";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { useFilterStore } from "@/lib/store/filter-store";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { toast } from "sonner";

interface ProjectGanttClientProps {
    workspaceId: string;
    projectId: string;
    initialTasks: GanttTask[];
    allTasks: any[];
    subtaskDataMap: Record<string, WorkspaceTaskType>;
    members: ProjectMembersType;
    tags: TagOption[];
    projectCounts?: Record<string, number>;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
    isShell?: boolean;
}

export function ProjectGanttClient({
    workspaceId,
    projectId,
    initialTasks,
    allTasks,
    subtaskDataMap,
    members,
    tags,
    projectCounts,
    currentUser,
    permissions,
    isShell = false
}: ProjectGanttClientProps) {
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
        params.append("l", "30"); // Limit per page

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
    }, [workspaceId, projectId, filters, searchQuery]);

    const handleLoadMore = () => {
        startTransition(() => {
            fetchTasks(true);
        });
    };

    const handleRequestSubtasks = async (taskId: string) => {
        console.log("[Gantt] handleRequestSubtasks triggered for:", taskId);
        expandedTaskIdsRef.current.add(taskId);

        // 🧠 Cache Strategy: Bypass cache if any filters are active
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
            params.set("p", projectId);
            params.set("vm", "gantt");
            params.set("sub", "true");      // 🚀 Signal for subtask expansion fetch
            params.set("hm", "subtasks");  // 🚀 Hierarchy mode for expansion

            // 🎯 Precision Filtering: Pass all current filters to expansion fetch
            if (filters.status) params.append("s", filters.status);
            if (filters.assigneeId) params.append("a", filters.assigneeId);
            if (filters.tagId) params.append("t", filters.tagId);
            if (searchQuery) params.append("q", searchQuery);
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
        name: m.user.name || '',
        surname: m.user.surname || '',
        email: m.user.email || '',
        image: m.user.image || ''
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
                    projectCounts={projectCounts}
                    members={members}
                    currentUser={currentUser}
                    permissions={permissions}
                    onLoadMore={handleLoadMore}
                    onRequestSubtasks={handleRequestSubtasks}
                    loadingSubtasks={loadingSubtasks}
                    isLoading={isLoadingMore || isPending}
                />
            </div>
        </div>
    );
}
