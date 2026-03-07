"use client";

import { useState, useMemo, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { GanttTask } from "../../../../../../../components/task/gantt/types";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { WorkspaceTaskType } from "@/data/task";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { GlobalFilterToolbar } from "@/components/task/shared/global-filter-toolbar";
import { MemberOption, TagOption, TaskFilters } from "@/components/task/shared/types";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";

interface ProjectGanttClientProps {
    workspaceId: string;
    projectId: string;
    initialTasks: GanttTask[]; // Hierarchical - already transformed server-side
    allTasks: any[]; // Flat tasks for filtering
    subtaskDataMap: Record<string, WorkspaceTaskType>; // Plain object for server→client serialization
    members: MemberOption[];
    tags: TagOption[];
    projectCounts?: Record<string, number>;
    currentUser?: { id: string };
    permissions?: {
        isWorkspaceAdmin: boolean;
        leadProjectIds: string[];
        managedProjectIds: string[];
    };
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
    permissions
}: ProjectGanttClientProps) {
    const [filters, setFilters] = useState<TaskFilters>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [isPending, startTransition] = useTransition();

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    // Handle subtask click
    const handleSubtaskClick = (subtaskId: string) => {
        const subtaskData = subtaskDataMap[subtaskId];
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
            if (filters.status && task.status !== filters.status) return false;
            if (filters.assigneeId && task.assignee?.id !== filters.assigneeId) return false;

            // Tag filtering
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

        // 2. Identify parents needed
        const parentsNeeded = new Set<string>();
        directMatches.forEach(t => {
            if (t.parentTaskId) parentsNeeded.add(t.parentTaskId);
            else parentsNeeded.add(t.id); // It is a parent
        });

        // 3. Collect final set
        const finalTasks = allTasks.filter(t =>
            directMatches.includes(t) || parentsNeeded.has(t.id)
        );

        return transformToGanttTasks(finalTasks);

    }, [allTasks, initialTasks, filters, searchQuery]);

    return (
        <div className="space-y-4">
            <GlobalFilterToolbar
                level="project"
                view="gantt"
                filters={filters}
                searchQuery={searchQuery}
                members={members}
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
                    tasks={ganttTasks}
                    workspaceId={workspaceId}
                    projectId={projectId}
                    onSubtaskClick={handleSubtaskClick}
                    projectCounts={projectCounts}
                    currentUser={currentUser}
                    permissions={permissions}
                />
            </div>
        </div>
    );
}
