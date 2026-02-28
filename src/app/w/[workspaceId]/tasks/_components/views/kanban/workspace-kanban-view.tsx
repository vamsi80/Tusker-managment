import { getTasks } from "@/data/task/get-tasks";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getWorkspaceMembers } from "@/data/workspace";
import { getUserProjects } from "@/data/project/get-projects";
import { KanbanBoard } from "@/components/task/kanban/kanban-board";
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
export async function WorkspaceKanbanView({ workspaceId }: WorkspaceKanbanViewProps) {
    // ONE QUERY: Fetch all relevant tasks for all statuses in one go
    const [
        tasksResponse,
        workspaceMembers,
        projects,
        projectMemberMatches,
        tags
    ] = await Promise.all([
        getTasks({
            workspaceId,
            hierarchyMode: "all",
            groupBy: "status",
            limit: 200, // Fetch a larger batch per status (Strategy D Window Function)
            sorts: [{ field: "createdAt", direction: "desc" }]
        }),
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
        getWorkspaceTags(workspaceId)
    ]);

    // Group tasks by status in JS
    const statusGroups: Record<string, any[]> = {
        TO_DO: [],
        IN_PROGRESS: [],
        CANCELLED: [],
        REVIEW: [],
        HOLD: [],
        COMPLETED: [],
    };

    tasksResponse.tasks.forEach((task: any) => {
        if (statusGroups[task.status]) {
            statusGroups[task.status].push(task);
        }
    });

    const limit = 50; // Strategy D default
    const initialData = {
        TO_DO: {
            subTasks: statusGroups.TO_DO,
            totalCount: statusGroups.TO_DO.length,
            hasMore: statusGroups.TO_DO.length >= limit,
            nextCursor: statusGroups.TO_DO.length > 0 ? { id: statusGroups.TO_DO[statusGroups.TO_DO.length - 1].id, createdAt: statusGroups.TO_DO[statusGroups.TO_DO.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        IN_PROGRESS: {
            subTasks: statusGroups.IN_PROGRESS,
            totalCount: statusGroups.IN_PROGRESS.length,
            hasMore: statusGroups.IN_PROGRESS.length >= limit,
            nextCursor: statusGroups.IN_PROGRESS.length > 0 ? { id: statusGroups.IN_PROGRESS[statusGroups.IN_PROGRESS.length - 1].id, createdAt: statusGroups.IN_PROGRESS[statusGroups.IN_PROGRESS.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        CANCELLED: {
            subTasks: statusGroups.CANCELLED,
            totalCount: statusGroups.CANCELLED.length,
            hasMore: statusGroups.CANCELLED.length >= limit,
            nextCursor: statusGroups.CANCELLED.length > 0 ? { id: statusGroups.CANCELLED[statusGroups.CANCELLED.length - 1].id, createdAt: statusGroups.CANCELLED[statusGroups.CANCELLED.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        REVIEW: {
            subTasks: statusGroups.REVIEW,
            totalCount: statusGroups.REVIEW.length,
            hasMore: statusGroups.REVIEW.length >= limit,
            nextCursor: statusGroups.REVIEW.length > 0 ? { id: statusGroups.REVIEW[statusGroups.REVIEW.length - 1].id, createdAt: statusGroups.REVIEW[statusGroups.REVIEW.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        HOLD: {
            subTasks: statusGroups.HOLD,
            totalCount: statusGroups.HOLD.length,
            hasMore: statusGroups.HOLD.length >= limit,
            nextCursor: statusGroups.HOLD.length > 0 ? { id: statusGroups.HOLD[statusGroups.HOLD.length - 1].id, createdAt: statusGroups.HOLD[statusGroups.HOLD.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        COMPLETED: {
            subTasks: statusGroups.COMPLETED,
            totalCount: statusGroups.COMPLETED.length,
            hasMore: statusGroups.COMPLETED.length >= limit,
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
                            name: member.user?.name || "",
                            surname: member.user?.surname || null,
                            email: member.user?.email || "",
                            image: member.user?.image || null,
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
        />
    );
}
