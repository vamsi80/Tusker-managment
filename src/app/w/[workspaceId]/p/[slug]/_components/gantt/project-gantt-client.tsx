"use client";

import { useState, useTransition, useEffect, useRef, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { GanttTask } from "../../../../../../../components/task/gantt/types";
import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";
import type { WorkspaceTaskType } from "@/types/task";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { GlobalFilterToolbar } from "@/components/task/shared/global-filter-toolbar";
import { TaskFilters } from "@/components/task/shared/types";
import { transformToGanttTasks, transformToGanttSubtasks } from "@/components/task/gantt/transform-tasks";
import { ProjectMembersType } from "@/types/project";
import { useFilterStore } from "@/lib/store/filter-store";
import { useWorkspaceTags } from "@/hooks/use-workspace-tags";
import { useFilteredFetch } from "@/hooks/use-filtered-fetch";

import { toast } from "sonner";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

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
    const tags = useWorkspaceTags(workspaceId);

    const [tasks, setTasks] = useState<GanttTask[]>(initialTasks);
    const [localTaskDataMap, setLocalTaskDataMap] = useState<Record<string, WorkspaceTaskType>>(subtaskDataMap);
    const [loadingSubtasks, setLoadingSubtasks] = useState<Set<string>>(new Set());
    const fetchingSubtasksRef = useRef<Set<string>>(new Set());
    const expandedTaskIdsRef = useRef<Set<string>>(new Set());
    const fetchingIdsRef = useRef<Set<string>>(new Set()); // Lock for subtask expansion

    const { filters, setFilters, searchQuery, setSearchQuery, clearFilters } = useFilterStore();
    const [isPending, startTransition] = useTransition();
    const lastFiltersActiveRef = useRef(false);

    const onFilteredResults = useCallback((newRawTasks: any[], meta: any) => {
        const newGanttTasks = transformToGanttTasks(newRawTasks);

        setLocalTaskDataMap(prev => {
            const next = { ...prev };
            newRawTasks.forEach((t: any) => {
                next[t.id] = t;
                if (t.subTasks) t.subTasks.forEach((s: any) => next[s.id] = s);
            });
            return next;
        });

        setTasks(newGanttTasks);
    }, []);

    const onAppendFilteredResults = useCallback((newRawTasks: any[], meta: any) => {
        const newGanttTasks = transformToGanttTasks(newRawTasks);

        setLocalTaskDataMap(prev => {
            const next = { ...prev };
            newRawTasks.forEach((t: any) => {
                next[t.id] = t;
                if (t.subTasks) t.subTasks.forEach((s: any) => next[s.id] = s);
            });
            return next;
        });

        setTasks(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const uniqueNew = newGanttTasks.filter(t => !existingIds.has(t.id));
            return [...prev, ...uniqueNew];
        });
    }, []);

    const ganttExtraParams = useMemo(() => ({ hm: "parents", sub: "false" }), []);

    const {
        isLoading: isFilteredLoading,
        loadMore: loadMoreFiltered,
        pagination: filterPagination,
        filtersActive
    } = useFilteredFetch({
        workspaceId,
        projectId,
        level: "project",
        viewMode: "gantt",
        extraParams: ganttExtraParams,
        onResults: onFilteredResults,
        onAppendResults: onAppendFilteredResults,
    });

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheetActions();

    // Handle subtask click

    const handleOpenSubTaskSheetFromGantt = useCallback((subtaskId: string) => {
        console.log("💎💎💎 [ProjectGanttClient] handleOpenSubTaskSheetFromGantt CALLED with ID:", subtaskId);
        console.log("[ProjectGanttClient] Map Size:", Object.keys(localTaskDataMap).length);
        const taskData = localTaskDataMap[subtaskId];

        if (taskData) {
            console.log("[ProjectGanttClient] Task found in map, calling openSubTaskSheet...");
            openSubTaskSheet(taskData);
        } else {
            console.warn("[ProjectGanttClient] Task data not found for sheet lookup. ID:", subtaskId, "Map Size:", Object.keys(localTaskDataMap).length);
            toast.error("Task details not found. Try refreshing.");
        }
    }, [localTaskDataMap, openSubTaskSheet]);

    console.log("[ProjectGanttClient] Rendering. handleOpenSubTaskSheetFromGantt present:", !!handleOpenSubTaskSheetFromGantt);

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

    // ---------------------------------------------------------------------------
    // 🚀 REALTIME SYNC: Listen for Pusher-driven structural mutations
    // ---------------------------------------------------------------------------
    useEffect(() => {
        const handleRealtimeSync = (e: Event) => {
            const { action, record } = (e as CustomEvent).detail || {};
            if (!action || !record) return;

            // Relevance guard: only respond to events in this project
            const isRelevant = !record.projectId || record.projectId === projectId;
            if (!isRelevant) return;

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
                setLocalTaskDataMap(prev => ({ ...prev, [record.id]: record }));
                const newSubtask = transformToGanttSubtasks([record]);
                setTasks((prev) =>
                    prev.map((t) => {
                        if (t.id !== record.parentTaskId) return t;
                        const updatedSubtasks = t.subtasks
                            ? t.subtasks.some((s) => s.id === record.id)
                                ? t.subtasks
                                : [...t.subtasks, ...newSubtask]
                            : t.subtasks;
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
                setLocalTaskDataMap(prev => ({ ...prev, [record.id]: { ...prev[record.id], ...record } }));
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
    }, [workspaceId, projectId]);


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

    const handleRequestSubtasks = async (taskId: string) => {
        if (fetchingIdsRef.current.has(taskId)) return;
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

                // 🚀 Sync: Store raw subtask data for the sheet
                setLocalTaskDataMap(prev => {
                    const next = { ...prev };
                    subTasks.forEach((s: any) => { next[s.id] = s; });
                    return next;
                });

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

                // 🚀 Sync: Store raw subtask data for the sheet
                setLocalTaskDataMap(prev => {
                    const next = { ...prev };
                    rawSubtasks.forEach((s: any) => { next[s.id] = s; });
                    return next;
                });

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
                    onSubtaskClick={handleOpenSubTaskSheetFromGantt}
                    onSubTaskUpdate={handleSubTaskUpdate}
                    projects={projects}
                    projectCounts={projectCounts}
                    members={members}
                    currentUser={currentUser}
                    permissions={permissions}
                    onLoadMore={handleLoadMore}
                    onRequestSubtasks={handleRequestSubtasks}
                    onRequestMoreSubtasks={handleRequestMoreSubtasks}
                    loadingSubtasks={loadingSubtasks}
                    isLoading={isFilteredLoading || isPending}
                    hasMore={filtersActive ? filterPagination.hasMore : false}
                />
            </div>
        </div>
    );
}
