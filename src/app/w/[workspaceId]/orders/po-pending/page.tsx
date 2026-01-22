import db from "@/lib/db";
import { PoPendingClientPage } from "./_componets/client";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { getProcurableProjects, getIndentRequests, getVendors } from "@/data/procurement";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function PoPage({ params }: PageProps) {
    const { workspaceId } = await params;

    // Fetch all required data in parallel
    const [indentsData, projectsData, materials, units, vendors, workspaceMembersResult] = await Promise.all([
        getIndentRequests(workspaceId),
        getProcurableProjects(workspaceId),
        db.material.findMany({
            where: { workspaceId, isActive: true },
            select: {
                id: true,
                name: true,
                defaultUnitId: true,
                vendors: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: { name: "asc" },
        }),
        db.unit.findMany({
            where: {
                OR: [
                    { workspaceId: workspaceId },
                    { isDefault: true }
                ],
                isActive: true
            },
            select: { id: true, name: true, abbreviation: true },
            orderBy: { name: "asc" },
        }),
        getVendors(workspaceId),
        getWorkspaceMembers(workspaceId),
    ]);

    const { indentRequests, workspaceMember } = indentsData;
    const projects = projectsData || []

    const tasks = projects.flatMap((project) =>
        project.tasks?.map((task) => ({
            id: task.id,
            name: task.name,
            projectId: project.id,
            assigneeId: task.assignee?.id,
        })) || []
    );

    return (
        <PoPendingClientPage
            data={indentRequests}
            userRole={workspaceMember.workspaceRole}
            workspaceId={workspaceId}
            projects={projects}
            tasks={tasks}
            materials={materials}
            units={units}
            vendors={vendors}
            workspaceMembers={workspaceMembersResult.workspaceMembers}
            currentMemberId={workspaceMember.id}
        />
    );
}
