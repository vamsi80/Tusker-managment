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

export function ProjectKanbanView({
    workspaceId,
    projectId,
    userId,
}: ProjectKanbanViewProps) {
    const { projectMembers, projectPermissions, isLoading: isProjectLoading, revalidate: revalidateProject } = useProjectLayout();

    useEffect(() => {
        // Background revalidation of workspace layout is now handled by the LayoutProvider
        revalidateProject();
    }, [revalidateProject]);

    // Allow rendering if project loading is done
    if (isProjectLoading) {
        return <AppLoader />;
    }

    // 🚀 Project Manager Derivation (Localized Optimization)
    // Derive managers directly from the project members list instead of relying on global metadata
    const projectManagers = {
        [projectId]: projectMembers
            .filter(m => m.projectRole === "LEAD" || m.projectRole === "PROJECT_MANAGER")
            .map(m => m.userId)
    };

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
            projectManagers={projectManagers}
            permissions={projectPermissions}
            userId={userId}
        />
    );
}
