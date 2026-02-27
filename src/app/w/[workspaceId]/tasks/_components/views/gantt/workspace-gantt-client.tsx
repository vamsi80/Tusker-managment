"use client";

import { Loader2 } from "lucide-react";
import { useState, useMemo, useTransition, useEffect } from "react";
import { GanttTask } from "@/components/task/gantt/types";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { GlobalFilterToolbar } from "@/components/task/shared/global-filter-toolbar";
import { ProjectOption, MemberOption, TaskFilters, TagOption } from "@/components/task/shared/types";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { useSubTaskSheet, useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";

interface WorkspaceGanttClientProps {
    workspaceId: string;
    initialTasks: GanttTask[];
    allTasks: any[];
    subtaskDataMap: Record<string, any>;
    projects: ProjectOption[];
    members: MemberOption[];
    tags: TagOption[];
    projectCounts?: Record<string, number>;
}

export function WorkspaceGanttClient({
    workspaceId,
    initialTasks,
    allTasks,
    subtaskDataMap,
    projects,
    members,
    tags,
    projectCounts
}: WorkspaceGanttClientProps) {
    const [filters, setFilters] = useState<TaskFilters>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [isPending, startTransition] = useTransition();

    // Bi-directional filtering
    const filteredProjects = useMemo(() => projects.filter((p: any) =>
        !filters.assigneeId || (p.memberIds && p.memberIds.includes(filters.assigneeId))
    ), [projects, filters.assigneeId]);

    const filteredMembers = useMemo(() => members.filter(m => {
        if (!filters.projectId) return true;
        const project = projects.find(p => p.id === filters.projectId);
        return (project as any)?.memberIds?.includes(m.id);
    }), [members, filters.projectId, projects]);

    const ganttTasks = useMemo(() => {
        const hasFilters = searchQuery || Object.keys(filters).length > 0;
        if (!hasFilters) return initialTasks;

        // 1. Identify direct matches
        const directMatches = allTasks.filter(task => {
            // Search
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchesSearch = task.name.toLowerCase().includes(q) ||
                    task.taskSlug.toLowerCase().includes(q) ||
                    task.assignee?.name.toLowerCase().includes(q) ||
                    task.assignee?.surname?.toLowerCase().includes(q);
                if (!matchesSearch) return false;
            }

            // Filters
            if (filters.projectId && task.projectId !== filters.projectId) return false;
            if (filters.status && task.status !== filters.status) return false;
            if (filters.assigneeId && task.assignee?.id !== filters.assigneeId) return false;

            // Tag filtering - checking tag relation
            if (filters.tagId) {
                // Check if task has a tag and matches the filter
                const tag = task.tag as any;
                if (!tag || tag.id !== filters.tagId) return false;
            }

            if (filters.startDate && (!task.startDate || new Date(task.startDate) < new Date(filters.startDate))) return false;
            if (filters.endDate) {
                const end = task.startDate ? new Date(new Date(task.startDate).getTime() + ((task.days || 1) - 1) * 86400000) : null;
                if (!end || end > new Date(filters.endDate)) return false;
            }

            return true;
        });

        // 2. Identify parents needed
        const parentsNeeded = new Set<string>();
        directMatches.forEach(t => {
            if (t.parentTaskId) parentsNeeded.add(t.parentTaskId);
            else parentsNeeded.add(t.id); // It is a parent
        });

        // 3. Collect final set (Matches + Parents)
        const finalTasks = allTasks.filter(t =>
            directMatches.includes(t) || parentsNeeded.has(t.id)
        );

        return transformToGanttTasks(finalTasks);

    }, [allTasks, initialTasks, filters, searchQuery]);

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

    const { setProjectTasksCache, entities } = useTaskCacheStore();
    const { openSubTaskSheet } = useSubTaskSheetActions();

    // Cache Synchronization
    useMemo(() => {
        if (allTasks && allTasks.length > 0) {
            // Group by project for cache
            const tasksByProject: Record<string, any[]> = {};
            allTasks.forEach(t => {
                const pid = t.projectId || 'unknown';
                if (!tasksByProject[pid]) tasksByProject[pid] = [];
                tasksByProject[pid].push(t);
            });

            // Update cache for each project found
            Object.entries(tasksByProject).forEach(([pid, tasks]) => {
                // We use a fire-and-forget style here to avoid render loops, 
                // but strictly speaking this should be in an effect. 
                // However, doing it in useMemo before render ensures commonly shared data is available immediately.
                // For safety with Zustand/React, we'll keep it simple or move to useEffect if tearing occurs.
                // Let's stick to useEffect for safety.
            });
        }
    }, [allTasks]);

    // Actual Effect for Cache Sync
    useEffect(() => {
        if (allTasks && allTasks.length > 0) {
            // Group by project
            const tasksByProject: Record<string, any[]> = {};
            allTasks.forEach(t => {
                const pid = t.projectId || 'unknown';
                if (!tasksByProject[pid]) tasksByProject[pid] = [];
                tasksByProject[pid].push(t);
            });

            Object.entries(tasksByProject).forEach(([pid, tasks]) => {
                setProjectTasksCache(pid, {
                    tasks: tasks,
                    hasMore: false, // Workspace view usually loads everything for the current filter
                    page: 1,
                    totalCount: tasks.length
                });
            });
        }
    }, [allTasks, setProjectTasksCache]);


    const handleSubtaskClick = (subtaskId: string) => {
        // Try getting from map (now object) first, then entity store
        let subtaskData = subtaskDataMap[subtaskId];
        if (!subtaskData) {
            subtaskData = entities[subtaskId];
        }

        if (subtaskData) {
            openSubTaskSheet(subtaskData);
        }
    };

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
                        setFilters({});
                        setSearchQuery("");
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
                    key={JSON.stringify(filters) + searchQuery}
                    workspaceId={workspaceId}
                    tasks={ganttTasks}
                    showProjectFilter={true}
                    projects={filteredProjects}
                    selectedProjectId={filters.projectId}
                    onProjectChange={(projectId) => {
                        handleFilterChange({ ...filters, projectId: projectId || undefined });
                    }}
                    groupByProject={true}
                    onSubtaskClick={handleSubtaskClick}
                    projectCounts={projectCounts}
                />
            </div>
        </div>
    );
}
