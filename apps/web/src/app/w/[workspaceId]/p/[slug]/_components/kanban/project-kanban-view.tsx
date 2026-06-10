"use client";
import { useEffect, useMemo } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { useProjectLayout } from "../project-layout-context";
import { KanbanBoard } from "@/components/task/kanban/kanban-board";

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
    const { projectMembers, projectManagers, projectPermissions, isLoading: isProjectLoading } = useProjectLayout();

    const COLUMNS = useMemo(() => ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "CANCELLED"] as const, []);

    const initialData = useMemo(() => {
        return COLUMNS.reduce((acc, status) => {
            acc[status] = {
                subTasks: [],
                totalCount: 0,
                hasMore: false,
                nextCursor: null,
                currentPage: 1
            };
            return acc;
        }, { isShell: true } as any);
    }, [COLUMNS]);

    useEffect(() => {
        if (!isProjectLoading) {
            console.log("DEBUG: Kanban Data for Project", {
                projectId,
                projectManagers,
                projectMembersCount: projectMembers.length,
                permissions: projectPermissions
            });
        }
    }, [projectId, projectManagers, projectMembers, projectPermissions, isProjectLoading]);

    // Allow rendering if project loading is done
    if (isProjectLoading) {
        return <AppLoader />;
    }

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
