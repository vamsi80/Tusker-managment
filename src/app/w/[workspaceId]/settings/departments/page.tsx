import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppLoader } from "@/components/shared/app-loader";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getWorkspaceDepartments, getWorkspaceShiftSchedules } from "@/data/department/get-departments";
import { DepartmentsManager } from "../_components/department/departments-manager";

export const revalidate = 60; // 1 minute ISR revalidation

interface DepartmentsPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function DepartmentsContent({ workspaceId }: { workspaceId: string }) {
    const permissions = await getWorkspacePermissions(workspaceId);

    // Hiding the nav tab is cosmetic; this is the gate that counts (the actions
    // re-check too, so a typed URL or a direct POST gets nothing either).
    if (!permissions.isWorkspaceAdmin) {
        redirect(`/w/${workspaceId}/settings`);
    }

    const [departments, schedules] = await Promise.all([
        getWorkspaceDepartments(workspaceId),
        getWorkspaceShiftSchedules(workspaceId),
    ]);

    return (
        <DepartmentsManager
            workspaceId={workspaceId}
            departments={departments}
            schedules={schedules}
            isWorkspaceAdmin={permissions.isWorkspaceAdmin}
        />
    );
}

export default async function DepartmentsPage({ params }: DepartmentsPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            <Suspense fallback={<AppLoader />}>
                <DepartmentsContent workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
