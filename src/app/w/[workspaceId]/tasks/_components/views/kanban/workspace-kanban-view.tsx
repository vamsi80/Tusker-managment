import { getTasks } from "@/data/task/get-tasks";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { ProjectService } from "@/server/services/project.service";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";
import dynamic from "next/dynamic";


const KanbanBoard = dynamic(
    () => import("@/components/task/kanban/kanban-board").then(mod => mod.KanbanBoard),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Board...</div> }
);

interface WorkspaceKanbanViewProps {
    workspaceId: string;
}

export default async function WorkspaceKanbanView({ workspaceId }: WorkspaceKanbanViewProps) {
    const userPromise = requireUser();
    const membersPromise = ProjectService.getWorkspaceProjectMembers(workspaceId);
    const tagsPromise = getWorkspaceTags(workspaceId);
    const assignmentsPromise = ProjectService.getWorkspaceProjectAssignments(workspaceId);
    const leadersPromise = ProjectService.getWorkspaceProjectLeaders(workspaceId);

    // 2. Wait for user safely before launching the dependent queries
    const user = await userPromise;
    const projectsPromise = ProjectService.getWorkspaceProjects(workspaceId, user.id);

    const COLUMNS = ["TO_DO", "IN_PROGRESS", "REVIEW", "COMPLETED", "HOLD", "CANCELLED"] as const;

    // 3. Launch the final large queries
    const viewStartTime = performance.now();
    const [
        permissions,
        projectMembers,
    ] = await Promise.all([
        getWorkspacePermissions(workspaceId),
        membersPromise,
    ]);
    const duration = performance.now() - viewStartTime;
    if (duration > 600) {
        console.warn(`[PERF_WARN] WorkspaceKanbanView rendered in ${duration.toFixed(2)}ms`);
    }

    const initialData = null;

    return (
        <KanbanBoard
            initialData={initialData as any}
            isShell={true}
            projectMembers={projectMembers as any}
            workspaceId={workspaceId}
            projectId="" 
            level="workspace"
            permissions={permissions}
            userId={user.id}
        />
    );
}
