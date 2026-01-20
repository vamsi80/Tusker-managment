import { getProcurableProjects, getIndentRequests, getVendors } from "@/data/procurement";
import db from "@/lib/db";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { Button } from "@/components/ui/button";
import { IconFileText } from "@tabler/icons-react";
import Link from "next/link";
import { PoClientPage } from "./_componets/client";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function IndentPage({ params }: PageProps) {
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

    // Get all tasks from projects for the dialog
    const tasks = projects.flatMap((project) =>
        project.tasks?.map((task) => ({
            id: task.id,
            name: task.name,
            projectId: project.id,
            assigneeId: task.assignee?.id,
        })) || []
    );

    return (
        <PoClientPage
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
            action={
                <Button asChild variant="outline">
                    <Link href={`/w/${workspaceId}/procurement/createRFQ`}>
                        <IconFileText className="mr-2 h-4 w-4" />
                        Create RFQ
                    </Link>
                </Button>
            }
        />
    );
}
