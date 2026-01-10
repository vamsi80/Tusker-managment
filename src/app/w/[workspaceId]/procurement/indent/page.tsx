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

    // Debug: Check if vendors exist at all
    const allVendorsDebug = await db.vendor.findMany({
        where: { workspaceId },
        select: { id: true, name: true, isActive: true }
    });

    console.log('🔍 VENDOR DEBUG:', {
        workspaceId,
        allVendorsInWorkspace: allVendorsDebug.length,
        allVendorsList: allVendorsDebug,
        activeVendorsFromQuery: vendors.length,
        activeVendorsList: vendors
    });

    const { indentRequests, workspaceMember } = indentsData;
    const projects = projectsData || [];

    // Debug: Log what we're fetching
    console.log('Server-side data fetch:', {
        workspaceId,
        materialsCount: materials.length,
        vendorsCount: vendors.length,
        vendors: vendors,
        materials: materials.map(m => ({ id: m.id, name: m.name, vendorCount: m.vendors?.length || 0 }))
    });


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
