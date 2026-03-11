"use client";

import { Loader2 } from "lucide-react";
import { useState, useMemo, useTransition, useEffect } from "react";
import { GanttTask } from "@/components/task/gantt/types";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { GlobalFilterToolbar } from "@/components/task/shared/global-filter-toolbar";
import { ProjectOption, MemberOption, TaskFilters, TagOption } from "@/components/task/shared/types";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { useSubTaskSheetActions } from "@/contexts/subtask-sheet-context";

interface WorkspaceGanttClientProps {
    workspaceId: string;
    initialTasks: GanttTask[];
    allTasks: any[];
    subtaskDataMap: Record<string, any>;
    projects: ProjectOption[];
    members: MemberOption[];
    tags: TagOption[];
    projectCounts?: Record<string, number>;
    currentUser: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
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
    permissions
}: WorkspaceGanttClientProps) {
    const [filters, setFilters] = useState<TaskFilters>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [isPending, startTransition] = useTransition();

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

        const directMatches = allTasks.filter(task => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchesSearch = task.name.toLowerCase().includes(q) ||
                    task.taskSlug.toLowerCase().includes(q) ||
                    task.assignee?.name.toLowerCase().includes(q) ||
                    task.assignee?.surname?.toLowerCase().includes(q);
                if (!matchesSearch) return false;
            }

            if (filters.projectId && task.projectId !== filters.projectId) return false;
            if (filters.status && task.status !== filters.status) return false;
            if (filters.assigneeId && task.assignee?.id !== filters.assigneeId) return false;

            if (filters.tagId) {
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

        const parentsNeeded = new Set<string>();
        directMatches.forEach(t => {
            if (t.parentTaskId) parentsNeeded.add(t.parentTaskId);
            else parentsNeeded.add(t.id);
        });

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

    const setProjectTasksCache = useTaskCacheStore(state => state.setProjectTasksCache);
    const { openSubTaskSheet } = useSubTaskSheetActions();

    useMemo(() => {
        if (allTasks && allTasks.length > 0) {
            const tasksByProject: Record<string, any[]> = {};
            allTasks.forEach(t => {
                const pid = t.projectId || 'unknown';
                if (!tasksByProject[pid]) tasksByProject[pid] = [];
                tasksByProject[pid].push(t);
            });

            Object.entries(tasksByProject).forEach(([pid, tasks]) => {
            });
        }
    }, [allTasks]);

    useEffect(() => {
        if (allTasks && allTasks.length > 0) {
            const tasksByProject: Record<string, any[]> = {};
            allTasks.forEach(t => {
                const pid = t.projectId || 'unknown';
                if (!tasksByProject[pid]) tasksByProject[pid] = [];
                tasksByProject[pid].push(t);
            });

            Object.entries(tasksByProject).forEach(([pid, tasks]) => {
                setProjectTasksCache(pid, {
                    tasks: tasks,
                    hasMore: false,
                    page: 1,
                    totalCount: tasks.length
                });
            });
        }
    }, [allTasks, setProjectTasksCache]);


    const handleSubtaskClick = (subtaskId: string) => {
        let subtaskData = subtaskDataMap[subtaskId];
        if (!subtaskData) {
            // Read directly from store state WITHOUT subscribing the component
            subtaskData = useTaskCacheStore.getState().entities[subtaskId];
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
                    currentUser={currentUser}
                    permissions={permissions}
                />
            </div>
        </div>
    );
}
