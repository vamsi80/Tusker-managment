import { getTasks } from "@/data/task/get-tasks";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getWorkspaceMembers } from "@/data/workspace";
import { getUserProjects } from "@/data/project/get-projects";
import { KanbanBoard } from "@/components/task/kanban/kanban-board";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";

interface WorkspaceKanbanViewProps {
    workspaceId: string;
}

/**
 * Workspace Kanban View
 * 
 * Shows all subtasks from all projects in Kanban format
 * Uses unified getTasks function for consistent data access
 */
export default async function WorkspaceKanbanView({ workspaceId }: WorkspaceKanbanViewProps) {
    const user = await requireUser();

    // ONE QUERY: Fetch all relevant tasks for all statuses in one go
    const [
        tasksResponse,
        workspaceMembers,
        projects,
        projectMemberMatches,
        tags,
        projectManagers,
    ] = await Promise.all([
        getTasks({
            workspaceId,
            groupBy: "status",
            excludeParents: true, // ONLY FETCH CARDS (NOT PARENTS)
            limit: 300,
            sorts: [{ field: "createdAt", direction: "desc" }],
            view_mode: "kanban"
        }, user.id),
        getWorkspaceMembers(workspaceId),
        getUserProjects(workspaceId),
        prisma.projectMember.findMany({
            where: { project: { workspaceId } },
            select: {
                projectId: true,
                workspaceMember: {
                    select: { userId: true }
                }
            }
        }),
        getWorkspaceTags(workspaceId),
        prisma.projectMember.findMany({
            where: { project: { workspaceId }, projectRole: "PROJECT_MANAGER", hasAccess: true },
            select: {
                projectId: true,
                workspaceMember: {
                    select: {
                        user: {
                            select: { id: true, surname: true }
                        }
                    }
                }
            }
        }),
        getWorkspacePermissions(workspaceId, user.id)
    ]);

    // Group tasks by status in JS with strict deduplication
    const statusGroups: Record<string, any[]> = {
        TO_DO: [],
        IN_PROGRESS: [],
        CANCELLED: [],
        REVIEW: [],
        HOLD: [],
        COMPLETED: [],
    };

    const idSet = new Set();
    tasksResponse.tasks.forEach((task: any) => {
        // Guard 1: Deduplicate
        if (idSet.has(task.id)) return;
        idSet.add(task.id);

        // Guard 2: Strict Status Grouping
        if (task.status && statusGroups[task.status]) {
            statusGroups[task.status].push(task);
        }
    });

    const counts = (tasksResponse.facets as any).statusCounts || {};

    const initialData = {
        TO_DO: {
            subTasks: statusGroups.TO_DO,
            totalCount: counts.TO_DO || statusGroups.TO_DO.length,
            hasMore: (counts.TO_DO || statusGroups.TO_DO.length) > statusGroups.TO_DO.length,
            nextCursor: statusGroups.TO_DO.length > 0 ? { id: statusGroups.TO_DO[statusGroups.TO_DO.length - 1].id, createdAt: statusGroups.TO_DO[statusGroups.TO_DO.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        IN_PROGRESS: {
            subTasks: statusGroups.IN_PROGRESS,
            totalCount: counts.IN_PROGRESS || statusGroups.IN_PROGRESS.length,
            hasMore: (counts.IN_PROGRESS || statusGroups.IN_PROGRESS.length) > statusGroups.IN_PROGRESS.length,
            nextCursor: statusGroups.IN_PROGRESS.length > 0 ? { id: statusGroups.IN_PROGRESS[statusGroups.IN_PROGRESS.length - 1].id, createdAt: statusGroups.IN_PROGRESS[statusGroups.IN_PROGRESS.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        CANCELLED: {
            subTasks: statusGroups.CANCELLED,
            totalCount: counts.CANCELLED || statusGroups.CANCELLED.length,
            hasMore: (counts.CANCELLED || statusGroups.CANCELLED.length) > statusGroups.CANCELLED.length,
            nextCursor: statusGroups.CANCELLED.length > 0 ? { id: statusGroups.CANCELLED[statusGroups.CANCELLED.length - 1].id, createdAt: statusGroups.CANCELLED[statusGroups.CANCELLED.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        REVIEW: {
            subTasks: statusGroups.REVIEW,
            totalCount: counts.REVIEW || statusGroups.REVIEW.length,
            hasMore: (counts.REVIEW || statusGroups.REVIEW.length) > statusGroups.REVIEW.length,
            nextCursor: statusGroups.REVIEW.length > 0 ? { id: statusGroups.REVIEW[statusGroups.REVIEW.length - 1].id, createdAt: statusGroups.REVIEW[statusGroups.REVIEW.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        HOLD: {
            subTasks: statusGroups.HOLD,
            totalCount: counts.HOLD || statusGroups.HOLD.length,
            hasMore: (counts.HOLD || statusGroups.HOLD.length) > statusGroups.HOLD.length,
            nextCursor: statusGroups.HOLD.length > 0 ? { id: statusGroups.HOLD[statusGroups.HOLD.length - 1].id, createdAt: statusGroups.HOLD[statusGroups.HOLD.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        COMPLETED: {
            subTasks: statusGroups.COMPLETED,
            totalCount: counts.COMPLETED || statusGroups.COMPLETED.length,
            hasMore: (counts.COMPLETED || statusGroups.COMPLETED.length) > statusGroups.COMPLETED.length,
            nextCursor: statusGroups.COMPLETED.length > 0 ? { id: statusGroups.COMPLETED[statusGroups.COMPLETED.length - 1].id, createdAt: statusGroups.COMPLETED[statusGroups.COMPLETED.length - 1].createdAt } : undefined,
            currentPage: 1
        },
    };

    // Convert workspace members to project members format
    // The KanbanBoard expects ProjectMembersType, but we can adapt workspace members
    const adaptedMembers = Array.from(
        new Map(
            workspaceMembers.workspaceMembers.map((member) => [
                member.userId,
                {
                    id: member.id,
                    workspaceMemberId: member.id,
                    projectId: workspaceId,
                    hasAccess: true,
                    role: "MEMBER" as const,
                    projectRole: "MEMBER" as const,
                    createdAt: new Date("2024-01-01T00:00:00Z"),
                    updatedAt: new Date("2024-01-01T00:00:00Z"),
                    workspaceMember: {
                        id: member.id,
                        workspaceId: member.workspaceId,
                        userId: member.userId,
                        workspaceRole: member.workspaceRole as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER",
                        createdAt: new Date("2024-01-01T00:00:00Z"),
                        updatedAt: new Date("2024-01-01T00:00:00Z"),
                        user: {
                            id: member.user?.id || "",
                            surname: member.user?.surname || null,
                        },
                    },
                }
            ])
        ).values()
    );

    // Build map of project -> userIds
    const projectUserMap: Record<string, string[]> = {};
    projectMemberMatches.forEach(pm => {
        if (!projectUserMap[pm.projectId]) projectUserMap[pm.projectId] = [];
        projectUserMap[pm.projectId].push(pm.workspaceMember.userId);
    });

    // Build map of project -> Project Manager user object
    const pmMap: Record<string, any> = {};
    projectManagers.forEach(pm => {
        pmMap[pm.projectId] = pm.workspaceMember.user;
    });

    // Convert projects to ProjectOption format for filters
    const projectOptions = projects.map(project => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        color: project.color,
        memberIds: projectUserMap[project.id] || []
    }));

    return (
        <KanbanBoard
            initialData={initialData}
            projectMembers={adaptedMembers}
            workspaceId={workspaceId}
            projectId="" // Empty for workspace-level
            projects={projectOptions}
            level="workspace"
            tags={tags.map(tag => ({ id: tag.id, name: tag.name }))}
            projectManagers={pmMap}
        />
    );
}
