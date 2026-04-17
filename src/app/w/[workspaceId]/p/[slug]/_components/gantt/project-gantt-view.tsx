"use client";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { useProjectLayout } from "../project-layout-context";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

const ProjectGanttClient = dynamic(
    () => import("./project-gantt-client").then(mod => mod.ProjectGanttClient),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Gantt Chart...</div> }
);

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
    const { tags, revalidate: revalidateWorkspace } = useWorkspaceLayout();
    const { projectMembers, projectPermissions, isLoading: isProjectLoading, revalidate: revalidateProject } = useProjectLayout();

    const [isLoadingTasks, setIsLoadingTasks] = useState(true);
    const [taskData, setTaskData] = useState<{ allTasks: any[]; projectCounts: any } | null>(null);

    useEffect(() => {
        // Trigger background revalidation on mount
        revalidateWorkspace();
        revalidateProject();

        async function fetchGanttTasks() {
            try {
                setIsLoadingTasks(true);
                // Gantt-specific fetch for large volume of tasks
                const tasksRes = await fetch(`/api/v1/tasks?w=${workspaceId}&p=${projectId}&vm=gantt&limit=1000&hm=parents&ist=true`).then(res => res.json());

                const result = tasksRes.data;
                const rawTasks = result.tasks || [];
                const allTasks: any[] = [];
                rawTasks.forEach((t: any) => {
                    allTasks.push(t);
                    if (t.subTasks && t.subTasks.length > 0) {
                        allTasks.push(...t.subTasks);
                    }
                });

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
    const ganttTasks = transformToGanttTasks(allTasks);
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
            isShell={false} // Wrapper fetches its own data, so not a shell
            allTasks={allTasks}
            subtaskDataMap={subtaskDataMap}
            members={projectMembers}
            tags={(tags || []).map((t: any) => ({ id: t.id, name: t.name }))}
            projectCounts={projectCounts}
            currentUser={{ id: userId }}
            permissions={{
                isWorkspaceAdmin: projectPermissions.isWorkspaceAdmin,
                leadProjectIds: projectPermissions.leadProjectIds || [],
                managedProjectIds: projectPermissions.managedProjectIds || []
            }}
        />
    );
}
