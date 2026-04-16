"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { useProjectLayout } from "../project-layout-context";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

const TaskTable = dynamic(() => import("@/components/task/list/task-table"), {
    loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Tasks...</div>
});

interface ProjectTaskListViewProps {
    workspaceId: string;
    projectId: string;
    userId: string;
}

/**
 * ProjectTaskListView
 * Consumes shared metadata (members, permissions, tags) from contexts.
 */
export function ProjectTaskListView({
    workspaceId,
    projectId,
    userId,
}: ProjectTaskListViewProps) {
    const { tags, revalidate: revalidateWorkspace } = useWorkspaceLayout();
    const { projectMembers, projectPermissions, isLoading: isProjectLoading, revalidate: revalidateProject } = useProjectLayout();

    useEffect(() => {
        // Trigger background revalidation on mount
        revalidateWorkspace();
        revalidateProject();
    }, [revalidateWorkspace, revalidateProject]);

    if (isProjectLoading) {
        return <AppLoader />;
    }

    return (
        <TaskTable
            initialTasks={[]}
            initialHasMore={false}
            initialNextCursor={null}
            members={projectMembers}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={projectPermissions.canCreateSubTask}
            permissions={projectPermissions}
            userId={userId}
            tags={(tags || []).map((tag: any) => ({
                id: tag.id,
                name: tag.name,
            }))}
        />
    );
}
