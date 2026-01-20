import { getProcurableProjects, getIndentRequests, getVendors } from "@/data/procurement";
import db from "@/lib/db";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { Button } from "@/components/ui/button";
import { IconFileText, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { IndentClientPage } from "./_components/client";
import { CreateIndentDialog } from "./_components/create-indent-dialog";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function IndentPage({ params }: PageProps) {
    const { workspaceId } = await params;

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
            assigneeId: task.assignee?.workspaceMemberId,
        })) || []
    );

    return (
        <IndentClientPage
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
                <>
                    <Button asChild variant="outline">
                        <Link href={`/w/${workspaceId}/procurement/createRFQ`}>
                            <IconFileText className="mr-2 h-4 w-4" />
                            Create RFQ
                        </Link>
                    </Button>
                    <CreateIndentDialog
                        trigger={
                            <Button>
                                <IconPlus className="mr-2 h-4 w-4" />
                                Create Indent
                            </Button>
                        }
                        workspaceId={workspaceId}
                        projects={projects}
                        tasks={tasks}
                        materials={materials}
                        units={units}
                        vendors={vendors}
                        userRole={workspaceMember.workspaceRole}
                        workspaceMembers={workspaceMembersResult.workspaceMembers}
                        currentMemberId={workspaceMember.id}
                    />
                </>
            }
        />
    );
}
