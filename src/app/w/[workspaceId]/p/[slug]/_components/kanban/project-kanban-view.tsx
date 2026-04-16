"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { useProjectLayout } from "../project-layout-context";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

const KanbanBoard = dynamic(
    () => import("@/components/task/kanban/kanban-board").then(mod => mod.KanbanBoard),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Kanban...</div> }
);

interface ProjectKanbanViewProps {
    workspaceId: string;
    projectId: string;
    userId: string;
}

/**
 * ProjectKanbanView
 * Consumes shared metadata (members, permissions, leader maps) from contexts.
 */
export function ProjectKanbanView({
    workspaceId,
    projectId,
    userId,
}: ProjectKanbanViewProps) {
    const { kanbanMetadata, revalidate: revalidateWorkspace } = useWorkspaceLayout();
    const { projectMembers, projectPermissions, isLoading: isProjectLoading, revalidate: revalidateProject } = useProjectLayout();

    useEffect(() => {
        // Trigger background revalidation on mount
        revalidateWorkspace();
        revalidateProject();
    }, [revalidateWorkspace, revalidateProject]);

    // Allow rendering if project loading is done, even if kanbanMetadata is still fetching
    if (isProjectLoading) {
        return <AppLoader />;
    }
    
    // Fallback metadata if still null
    const metadata = kanbanMetadata || { projectLeadersMap: {}, projectMembersMap: {} };
    
    const COLUMNS = ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "CANCELLED"] as const;
    const initialData = COLUMNS.reduce((acc, status) => {
        acc[status] = {
            subTasks: [],
            totalCount: 0,
            hasMore: false,
            nextCursor: null,
            currentPage: 1
        };
        return acc;
    }, {} as any);
    
    return (
        <KanbanBoard
            initialData={initialData}
            projectMembers={projectMembers as any}
            workspaceId={workspaceId}
            projectId={projectId}
            projectManagers={metadata.projectLeadersMap || {}}
            permissions={projectPermissions}
            userId={userId}
        />
    );
}
