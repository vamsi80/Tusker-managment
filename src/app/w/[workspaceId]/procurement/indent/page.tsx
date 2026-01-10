import { getProcurableProjects } from "@/data/procurement/get-procurable-projects";
import { getIndentRequests } from "@/data/procurement/get-indent-requests";
import { getVendors } from "@/data/procurement/get-vendors";
import { IndentClientPage } from "./_components/client";
import { CreateIndentDialog } from "../_components/create-indent-dialog";
import db from "@/lib/db";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function IndentPage({ params }: PageProps) {
    const { workspaceId } = await params;

    // Fetch all required data in parallel
    const [indentsData, projectsData, materials, units, vendors] = await Promise.all([
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
    ]);


    const { indentRequests, workspaceMember } = indentsData;
    const projects = projectsData || []


    // Get all tasks from projects for the dialog
    const tasks = projects.flatMap((project) =>
        project.tasks?.map((task) => ({
            id: task.id,
            name: task.name,
            projectId: project.id,
        })) || []
    );

    return (
        <IndentClientPage
            data={indentRequests}
            userRole={workspaceMember.workspaceRole}
            action={
                <CreateIndentDialog
                    workspaceId={workspaceId}
                    projects={projects}
                    tasks={tasks}
                    materials={materials}
                    units={units}
                    vendors={vendors}
                    userRole={workspaceMember.workspaceRole}
                />
            }
        />
    );
}
