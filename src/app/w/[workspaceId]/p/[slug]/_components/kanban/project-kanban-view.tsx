"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { AppLoader } from "@/components/shared/app-loader";
import { useProjectLayout } from "../project-layout-context";

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
        revalidateProject();
    }, [revalidateProject]);

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

    const projectManagers = useMemo(() => ({
        [projectId]: projectMembers
            .filter(m =>
                m.projectRole === "LEAD" ||
                m.projectRole === "PROJECT_MANAGER" ||
                m.workspaceRole === "OWNER" ||
                m.workspaceRole === "ADMIN"
            )
            .map(m => ({
                id: m.userId,
                surname: m.user.surname,
            }))
    }), [projectId, projectMembers]);

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
