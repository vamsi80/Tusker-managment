"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GanttTask } from "../../../../../../../components/task/gantt/types";
import { useSubTaskSheet } from "@/contexts/subtask-sheet-context";
import { FlatTaskType } from "@/data/task";
import { GanttChart } from "@/components/task/gantt/gantt-chart";
import { useTaskCacheStore } from "@/lib/store/task-cache-store";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";

interface ProjectGanttClientProps {
    workspaceId: string;
    projectId: string;
    initialTasks: GanttTask[]; // Hierarchical
    subtaskDataMap: Map<string, FlatTaskType>;
    projectCounts?: Record<string, number>;
}

const TASKS_PER_PAGE = 50;

function flattenGanttTasks(tasks: GanttTask[]): any[] {
    let result: any[] = [];
    tasks.forEach(task => {
        const { subtasks, ...rest } = task;
        result.push(rest);
        if (subtasks && subtasks.length > 0) {
            // Subtasks are leaf nodes in current Gantt model, so just add them
            result = result.concat(subtasks);
        }
    });
    return result;
}

export function ProjectGanttClient({ workspaceId, projectId, initialTasks, subtaskDataMap, projectCounts }: ProjectGanttClientProps) {
    const [visibleTaskCount, setVisibleTaskCount] = useState(TASKS_PER_PAGE);
    const observerTarget = useRef<HTMLDivElement>(null);

    const {
        entities,
        projectLists,
        setProjectTasksCache,
        upsertTasks
    } = useTaskCacheStore();

    // Sync initialTasks to Cache on mount
    useEffect(() => {
        if (initialTasks && initialTasks.length > 0) {
            const flatTasks = flattenGanttTasks(initialTasks);

            // We store ALL task IDs (parents + subtasks) in the project list for the cache to work with transformToGanttTasks
            // Or typically project list = only top level? 
            // transformToGanttTasks takes a flat list and builds tree. It needs ALL nodes.
            // So we cache ALL IDs.

            setProjectTasksCache(projectId, {
                tasks: flatTasks,
                hasMore: false, // We assume initial load covers for now, logic to be enhanced
                page: 1,
                totalCount: flatTasks.length
            });
        }
    }, [initialTasks, projectId, setProjectTasksCache]);

    // Read from Cache
    const cachedGanttTasks = useMemo(() => {
        const listMetadata = projectLists[projectId];
        if (!listMetadata || !listMetadata.ids) return initialTasks; // Fallback

        const tasksFromCache = listMetadata.ids
            .map(id => entities[id])
            .filter(Boolean);

        if (tasksFromCache.length === 0) return initialTasks;

        return transformToGanttTasks(tasksFromCache);
    }, [projectLists, projectId, entities, initialTasks]);

    // Use global subtask sheet context
    const { openSubTaskSheet } = useSubTaskSheet();

    // Handle subtask click
    const handleSubtaskClick = (subtaskId: string) => {
        // Try getting from map first, then entity store
        let subtaskData = subtaskDataMap.get(subtaskId);
        if (!subtaskData) {
            subtaskData = entities[subtaskId] as FlatTaskType;
        }

        if (subtaskData) {
            openSubTaskSheet(subtaskData);
        }
    };

    // Load more tasks (Locally paginating the cached/initial list)
    const handleLoadMoreTasks = () => {
        setVisibleTaskCount(prev => Math.min(prev + TASKS_PER_PAGE, cachedGanttTasks.length));
    };

    // Auto-scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && visibleTaskCount < cachedGanttTasks.length) {
                    handleLoadMoreTasks();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [visibleTaskCount, cachedGanttTasks.length]);

    // Get visible tasks
    const visibleTasks = cachedGanttTasks.slice(0, visibleTaskCount);
    const hasMoreTasks = visibleTaskCount < cachedGanttTasks.length;

    return (
        <>
            <div className="h-[calc(100vh-280px)] flex flex-col">
                <div className="flex-1 overflow-hidden">
                    <GanttChart
                        tasks={visibleTasks}
                        workspaceId={workspaceId}
                        projectId={projectId}
                        onSubtaskClick={handleSubtaskClick}
                        projectCounts={projectCounts}
                    />
                </div>

                {/* Auto-Load Trigger */}
                {hasMoreTasks && (
                    <div ref={observerTarget} className="h-20 w-full flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">Loading more tasks...</span>
                    </div>
                )}
            </div>
        </>
    );
}
