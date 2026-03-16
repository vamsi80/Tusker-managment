import { getTasks } from "@/data/task/get-tasks";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getUserProjects } from "@/data/project/get-projects";
import dynamic from "next/dynamic";
import { getProjectMembers } from "@/data/project/get-project-members";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";

const WorkspaceGanttClient = dynamic(
    () => import("./workspace-gantt-client").then(mod => mod.WorkspaceGanttClient),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Gantt Chart...</div> }
);

interface WorkspaceGanttViewProps {
    workspaceId: string;
}

export async function WorkspaceGanttView({ workspaceId }: WorkspaceGanttViewProps) {
    const userPromise = requireUser();
    const projectsPromise = getUserProjects(workspaceId);
    const membersPromise = getProjectMembers({ workspaceId });
    const tagsPromise = getWorkspaceTags(workspaceId);
    const pmMatchesPromise = prisma.projectMember.findMany({
        where: { project: { workspaceId } },
        select: {
            projectId: true,
            userId: true,
            projectRole: true
        }
    });

    const user = await userPromise;

    const [tasksData, projects, projectMembers, projectMemberMatches, tags, permissions] = await Promise.all([
        getTasks({
            workspaceId,
            hierarchyMode: "parents",
            includeSubTasks: true,
            limit: 1000,
            includeFacets: true,
            view_mode: "gantt"
        }, user.id),
        projectsPromise,
        membersPromise,
        pmMatchesPromise,
        tagsPromise,
        getWorkspacePermissions(workspaceId, user.id),
    ]);

    const rawTasks = tasksData.tasks;
    const allTasks: any[] = [];
    rawTasks.forEach((t: any) => {
        allTasks.push(t);
        if (t.subTasks && t.subTasks.length > 0) {
            allTasks.push(...t.subTasks);
        }
    });

    // Build map of project -> userIds and project-user role map
    const projectUserMap: Record<string, string[]> = {};
    const roleMap: Record<string, string> = {};
    projectMemberMatches.forEach(pm => {
        if (!projectUserMap[pm.projectId]) projectUserMap[pm.projectId] = [];
        projectUserMap[pm.projectId].push(pm.userId);
        roleMap[`${pm.projectId}-${pm.userId}`] = pm.projectRole;
    });

    // Enrich tasks with assignee roles for permission checks
    allTasks.forEach(t => {
        if (t.assigneeTo && t.projectId) {
            t.projectRole = roleMap[`${t.projectId}-${t.assigneeTo}`];
        }
    });

    // Format options
    const projectOptions = projects.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        color: p.color || undefined,
        memberIds: projectUserMap[p.id] || []
    }));

    // Transform data to GanttTask format
    const ganttTasks = transformToGanttTasks(allTasks);

    return (
        <WorkspaceGanttClient
            workspaceId={workspaceId}
            initialTasks={ganttTasks}
            allTasks={allTasks}
            subtaskDataMap={{}} // Populated by client if needed or passed from allTasks
            projects={projectOptions}
            members={projectMembers as any}
            tags={tags.map(t => ({ id: t.id, name: t.name }))}
            projectCounts={tasksData.facets.projects}
            currentUser={{ id: user.id }}
            permissions={{
                isWorkspaceAdmin: permissions.isWorkspaceAdmin,
                leadProjectIds: permissions.leadProjectIds || [],
                managedProjectIds: permissions.managedProjectIds || []
            }}
        />
    );
}
