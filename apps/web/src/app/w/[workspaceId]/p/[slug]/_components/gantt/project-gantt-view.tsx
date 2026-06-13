"use client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AppLoader } from "@/components/shared/app-loader";
import { transformToGanttTasks, type RawTaskInput } from "@/components/task/gantt/transform-tasks";
import { useProjectLayout } from "../project-layout-context";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { ProjectGanttClient } from "./project-gantt-client";
import type { WorkspaceTaskType } from "@/types/task";

interface GanttServerWrapperProps {
    workspaceId: string;
    projectId: string;
    userId: string;
}

/**
 * ProjectGanttView (GanttServerWrapper)
 * Client-side bootstrap for Gantt Chart.
 * Consumes shared metadata (members, permissions, tags) from contexts.
 * Fetches Gantt-specific task data independently.
 */
export function GanttServerWrapper({ workspaceId, projectId, userId }: GanttServerWrapperProps) {
    const { revalidate: revalidateWorkspace } = useWorkspaceLayout();
    const { projectMembers, projectPermissions, isLoading: isProjectLoading, revalidate: revalidateProject } = useProjectLayout();

    const [isLoadingTasks, setIsLoadingTasks] = useState(true);
    const [taskData, setTaskData] = useState<{ allTasks: WorkspaceTaskType[]; projectCounts: Record<string, number> } | null>(null);

    useEffect(() => {
        // Trigger background revalidation on mount
        revalidateWorkspace();
        revalidateProject();

        async function fetchGanttTasks() {
            try {
                setIsLoadingTasks(true);
                // Gantt-specific fetch for large volume of tasks
                const tasksRes = await fetch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/gantt?limit=50`).then(res => res.json());

                if (!tasksRes.success) {
                    console.error("Server error fetching tasks:", tasksRes.error);
                    toast.error(tasksRes.error || "Failed to load tasks");
                    return;
                }

                const result = tasksRes.data;
                if (!result) {
                    console.error("No data returned from tasks API");
                    return;
                }

                const rawTasks = result.tasks || [];
                const allTasks: WorkspaceTaskType[] = [...rawTasks];


                setTaskData({
                    allTasks,
                    projectCounts: result.facets?.projects || {}
                });
            } catch (error) {
                console.error("Failed to fetch gantt tasks:", error);
            } finally {
                setIsLoadingTasks(false);
            }
        }

        fetchGanttTasks();
    }, [workspaceId, projectId, revalidateWorkspace, revalidateProject]);

    if (isProjectLoading || isLoadingTasks || !taskData) {
        return <AppLoader />;
    }

    const { allTasks, projectCounts } = taskData;
    const ganttTasks = transformToGanttTasks(allTasks as RawTaskInput[]);
    const subtaskDataMap: Record<string, any> = {};
    allTasks.forEach(task => {
        if (task.parentTaskId) {
            subtaskDataMap[task.id] = task;
        }
    });

    return (
        <ProjectGanttClient
            workspaceId={workspaceId}
            projectId={projectId}
            initialTasks={ganttTasks}
            isShell={false}
            allTasks={allTasks}
            subtaskDataMap={subtaskDataMap}
            members={projectMembers}
            projectCounts={projectCounts}
            currentUser={{ id: userId }}
        />
    );
}
