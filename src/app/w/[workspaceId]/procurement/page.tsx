import { getProcurableProjects } from "@/data/procurement/get-procurable-projects";
import { getIndentRequests } from "@/data/procurement/get-indent-requests";
import { getProcurementTasks } from "@/data/procurement/get-procurement-tasks";
import { CreateIndentDialog } from "./_components/create-indent-dialog";
import { ProcurementTasksTable } from "./_components/procurement-tasks-table";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { IconFileText, IconPackage, IconClipboardCheck } from "@tabler/icons-react";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function ProcurementDashboardPage({ params }: PageProps) {
    const { workspaceId } = await params;

    // Get current user
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    const [projectsData, indentsData, procurementTasks, materials, units, workspaceMember] = await Promise.all([
        getProcurableProjects(workspaceId),
        getIndentRequests(workspaceId),
        getProcurementTasks(workspaceId),
        db.material.findMany({
            where: { workspaceId, isActive: true },
            select: { id: true, name: true },
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
        session?.user?.id ? db.workspaceMember.findFirst({
            where: {
                workspaceId: workspaceId,
                userId: session.user.id,
            },
            select: { workspaceRole: true },
        }) : null,
    ]);

    const projects = projectsData || [];
    const { indentRequests } = indentsData;

    // Get all tasks from projects for the dialog
    const tasks = projects.flatMap((project) =>
        project.tasks?.map((task) => ({
            id: task.id,
            name: task.name,
            projectId: project.id,
        })) || []
    );

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
                </div>
                <CreateIndentDialog
                    workspaceId={workspaceId}
                    projects={projects}
                    tasks={tasks}
                    materials={materials}
                    units={units}
                    userRole={workspaceMember?.workspaceRole}
                />
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Total Requests</p>
                            <p className="text-2xl font-bold mt-1">{indentRequests.length}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <IconFileText className="h-6 w-6 text-blue-600" />
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Pending</p>
                            <p className="text-2xl font-bold mt-1">
                                {indentRequests.filter((i) => i.status === "REQUESTED").length}
                            </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                            <IconPackage className="h-6 w-6 text-yellow-600" />
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Under Review</p>
                            <p className="text-2xl font-bold mt-1">
                                {indentRequests.filter((i) => i.status === "UNDER_REVIEW").length}
                            </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                            <IconFileText className="h-6 w-6 text-orange-600" />
                        </div>
                    </div>
                </div>

                <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Approved</p>
                            <p className="text-2xl font-bold mt-1">
                                {indentRequests.filter((i) => i.status === "APPROVED").length}
                            </p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                            <IconPackage className="h-6 w-6 text-green-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Procurement Tasks Section */}
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
                    userRole={workspaceMember?.workspaceRole}
                />
            </div>
        </div>
    );
}