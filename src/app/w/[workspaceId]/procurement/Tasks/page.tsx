import { getProcurableProjects } from "@/data/procurement/get-procurable-projects";
import { getProcurementTasks } from "@/data/procurement/get-procurement-tasks";
import { getVendors } from "@/data/procurement/get-vendors";
import { ProcurementTasksTable } from "../_components/procurement-tasks-table";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { IconClipboardCheck } from "@tabler/icons-react";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function ProcurementTasksPage({ params }: PageProps) {
    const { workspaceId } = await params;

    // Get current user
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    const [projectsData, procurementTasks, materials, units, vendors, workspaceMember] = await Promise.all([
        getProcurableProjects(workspaceId),
        getProcurementTasks(workspaceId),
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
        session?.user?.id ? db.workspaceMember.findFirst({
            where: {
                workspaceId: workspaceId,
                userId: session.user.id,
            },
            select: { workspaceRole: true },
        }) : null,
    ]);

    const projects = projectsData || [];

    // Get all tasks from projects for the dialog/table if needed
    const tasks = projects.flatMap((project) =>
        project.tasks?.map((task) => ({
            id: task.id,
            name: task.name,
            projectId: project.id,
        })) || []
    );

    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <IconClipboardCheck className="h-4 w-4 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold">Procurement Tasks</h3>
            </div>

            <ProcurementTasksTable
                workspaceId={workspaceId}
                procurementTasks={procurementTasks}
                projects={projects}
                tasks={tasks}
                materials={materials}
                units={units}
                vendors={vendors}
                userRole={workspaceMember?.workspaceRole}
            />
        </div>
    );
}