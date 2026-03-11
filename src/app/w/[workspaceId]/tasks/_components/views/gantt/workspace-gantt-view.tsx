import { getTasks } from "@/data/task/get-tasks";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getUserProjects } from "@/data/project/get-projects";
import dynamic from "next/dynamic";

const WorkspaceGanttClient = dynamic(
    () => import("./workspace-gantt-client").then(mod => mod.WorkspaceGanttClient),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Gantt Chart...</div> }
);
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { getSubTasksByParentIds } from "@/data/task/get-subtasks-batch";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";

interface WorkspaceGanttViewProps {
    workspaceId: string;
}

/**
 * Workspace Gantt View Server Component
 * 
 * Shows all tasks from all accessible projects in Gantt chart format
 * Uses the same permission-based getTasks as Kanban and List views:
 * - ADMIN/OWNER: See all tasks from all projects
 * - MEMBER: See only tasks from assigned projects and their assigned subtasks
 */
export async function WorkspaceGanttView({ workspaceId }: WorkspaceGanttViewProps) {
    // 1. Kick off all independent queries immediately!
    const userPromise = requireUser();
    const projectsPromise = getUserProjects(workspaceId);
    const membersPromise = getWorkspaceMembers(workspaceId);
    const tagsPromise = getWorkspaceTags(workspaceId);
    const pmMatchesPromise = prisma.projectMember.findMany({
        where: { project: { workspaceId } },
        select: {
            projectId: true,
            workspaceMember: { select: { userId: true } },
            projectRole: true
        }
    });

    // 2. Wait for user safely
    const user = await userPromise;

    // 3. Launch the final large queries
    const [tasksData, projects, workspaceMembers, projectMemberMatches, tags, permissions] = await Promise.all([
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

    const parentTasks = allTasks.filter(task => !task.parentTaskId);

    const subtasksMap = new Map<string, any[]>();

    allTasks.forEach(task => {
        if (task.parentTaskId) {
            if (!subtasksMap.has(task.parentTaskId)) {
                subtasksMap.set(task.parentTaskId, []);
            }
            subtasksMap.get(task.parentTaskId)!.push(task);
        }
    });

    // Sort parent tasks by position
    const sortedParentTasks = [...parentTasks].sort((a, b) => {
        const posA = a.position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.position ?? Number.MAX_SAFE_INTEGER;
        return posA - posB;
    });

    // Create a plain object for subtask data for the details sheet (better for RSC serialization)
    const subtaskDataObj: Record<string, any> = {};
    allTasks.forEach(task => {
        if (task.parentTaskId) {
            subtaskDataObj[task.id] = task;
        }
    });

    // Build map of project -> userIds and project-user role map
    const projectUserMap: Record<string, string[]> = {};
    const roleMap: Record<string, string> = {};
    projectMemberMatches.forEach(pm => {
        if (!projectUserMap[pm.projectId]) projectUserMap[pm.projectId] = [];
        projectUserMap[pm.projectId].push(pm.workspaceMember.userId);
        roleMap[`${pm.projectId}-${pm.workspaceMember.userId}`] = pm.projectRole;
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

    const memberOptions = workspaceMembers.workspaceMembers.map(m => ({
        id: m.userId,
        name: m.user?.name || '',
        surname: m.user?.surname || undefined,
        email: m.user?.email || undefined
    }));

    const tagOptions = tags.map(t => ({
        id: t.id,
        name: t.name
    }));

    // Transform data to GanttTask format
    const ganttTasks = transformToGanttTasks(allTasks);


    return (
        <WorkspaceGanttClient
            workspaceId={workspaceId}
            initialTasks={ganttTasks}
            allTasks={allTasks}
            subtaskDataMap={subtaskDataObj}
            projects={projectOptions}
            members={memberOptions}
            tags={tagOptions}
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
