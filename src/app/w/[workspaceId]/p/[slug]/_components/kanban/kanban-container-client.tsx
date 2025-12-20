"use client";

import { useProject } from "../shared/project-context";
import { KanbanContainerPaginated } from "./kanban-container-paginated";

interface KanbanContainerClientProps {
    workspaceId: string;
}

export function KanbanContainerClient({ workspaceId }: KanbanContainerClientProps) {
    // Get project data from context (fetched once in layout)
    const pageData = useProject();

    return (
        <KanbanContainerPaginated
            workspaceId={workspaceId}
            projectId={pageData.project.id}
        />
    );
}
