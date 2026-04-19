import { getTasks } from "@/data/task/get-tasks";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getUserProjects } from "@/data/project/get-projects";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";
import dynamic from "next/dynamic";
import { getProjectMembers } from "@/data/project/get-project-members";
import { getWorkspaceProjectAssignments, getWorkspaceProjectLeaders } from "@/data/workspace/get-workspace-kanban-data";

const KanbanBoard = dynamic(
    () => import("@/components/task/kanban/kanban-board").then(mod => mod.KanbanBoard),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Board...</div> }
);

interface WorkspaceKanbanViewProps {
    workspaceId: string;
}

export default async function WorkspaceKanbanView({ workspaceId }: WorkspaceKanbanViewProps) {
    const userPromise = requireUser();
    const membersPromise = getProjectMembers({ workspaceId });
    const projectsPromise = getUserProjects(workspaceId);
    const tagsPromise = getWorkspaceTags(workspaceId);
    const assignmentsPromise = getWorkspaceProjectAssignments(workspaceId);
    const leadersPromise = getWorkspaceProjectLeaders(workspaceId);

    // 2. Wait for user safely before launching the dependent queries
    const user = await userPromise;

    const COLUMNS = ["TO_DO", "IN_PROGRESS", "REVIEW", "COMPLETED", "HOLD", "CANCELLED"] as const;

    // 3. Launch the final large queries
    const viewStartTime = performance.now();
    const [
        permissions,
        projectMembers,
        projects,
        projectAssignments,
        tags,
        projectLeaders,
    ] = await Promise.all([
        getWorkspacePermissions(workspaceId, user.id),
        membersPromise,
        projectsPromise,
        assignmentsPromise,
        tagsPromise,
        leadersPromise,
    ]);
    const duration = performance.now() - viewStartTime;
    if (duration > 600) {
        console.warn(`[PERF_WARN] WorkspaceKanbanView rendered in ${duration.toFixed(2)}ms`);
    }

    const initialData = null;

    // Convert projects to ProjectOption format for filters
    const projectOptions = projects.map(project => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        color: project.color,
        memberIds: (projectAssignments[project.id] || []).map((m: any) => m.id)
    }));


    return (
        <KanbanBoard
            initialData={initialData as any}
            isShell={true}
            projectMembers={projectMembers as any}
            workspaceId={workspaceId}
            projectId="" 
            projects={projectOptions}
            level="workspace"
            tags={tags.map(tag => ({ id: tag.id, name: tag.name }))}
            projectManagers={projectLeaders}
            permissions={permissions}
            userId={user.id}
        />
    );
}
