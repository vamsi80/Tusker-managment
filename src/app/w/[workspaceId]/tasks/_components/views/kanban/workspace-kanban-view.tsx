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
    // Fetch first page (5 cards) for each status column in parallel
    // Using unified getTasks function
    const fetchColumn = async (status: string) => {
        const res = await getTasks({
            workspaceId,
            view: "kanban",
            status,
            page: 1,
            limit: 15
            // projectId intentionally undefined for workspace level
        });

        // Adapt response to match component expectation
        return {
            subTasks: res.tasks as any,
            totalCount: res.totalCount,
            hasMore: res.hasMore,
            currentPage: 1
        };
    };

    const [
        todoData,
        inProgressData,
        cancelledData,
        reviewData,
        holdData,
        completedData,
        workspaceMembers,
        projects,
        projectMemberMatches,
        tags
    ] = await Promise.all([
        fetchColumn("TO_DO"),
        fetchColumn("IN_PROGRESS"),
        fetchColumn("CANCELLED"),
        fetchColumn("REVIEW"),
        fetchColumn("HOLD"),
        fetchColumn("COMPLETED"),
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

    // Combine all initial data
    const initialData = {
        TO_DO: todoData,
        IN_PROGRESS: inProgressData,
        CANCELLED: cancelledData,
        REVIEW: reviewData,
        HOLD: holdData,
        COMPLETED: completedData,
    };

    // Convert workspace members to project members format
    // The KanbanBoard expects ProjectMembersType, but we can adapt workspace members
    const adaptedMembers = workspaceMembers.workspaceMembers.map((member) => ({
        id: member.id,
        workspaceMemberId: member.id,
        projectId: workspaceId, // Use workspaceId as placeholder
        hasAccess: true,
        role: "MEMBER" as const,
        projectRole: "MEMBER" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        workspaceMember: {
            id: member.id,
            workspaceId: member.workspaceId,
            userId: member.userId,
            workspaceRole: member.workspaceRole as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER",
            createdAt: new Date(),
            updatedAt: new Date(),
            user: {
                id: member.user?.id || "",
                name: member.user?.name || "",
                surname: member.user?.surname || null,
                email: member.user?.email || "",
                image: member.user?.image || null,
            },
        },
    }));

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
