import { Suspense } from "react";
import { redirect } from "next/navigation";
import prisma from "@tusker/db";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { AppLoader } from "@/components/shared/app-loader";
import { coerceRoleOverrides, coerceMemberOverrides } from "@/lib/constants/capabilities";
import { PermissionsManager } from "../_components/permissions/permissions-manager";

interface PermissionsPageProps {
    params: Promise<{ workspaceId: string }>;
}

async function PermissionsContent({ workspaceId }: { workspaceId: string }) {
    const permissions = await getWorkspacePermissions(workspaceId, undefined, true);
    const viewerRole = permissions.workspaceRole;

    // Hard gate. The sidebar tab is hidden for everyone else, but a typed URL
    // lands here, so this is the check that counts.
    if (viewerRole !== "OWNER" && viewerRole !== "ADMIN") {
        redirect(`/w/${workspaceId}/settings`);
    }

    const [workspace, members] = await Promise.all([
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { permissionOverrides: true },
        }),
        prisma.workspaceMember.findMany({
            where: { workspaceId },
            select: {
                id: true,
                workspaceRole: true,
                designation: true,
                permissionOverrides: true,
                user: { select: { name: true, surname: true, email: true } },
            },
            orderBy: [{ workspaceRole: "asc" }, { createdAt: "asc" }],
        }),
    ]);

    if (!workspace) redirect(`/w/${workspaceId}/settings`);

    return (
        <PermissionsManager
            workspaceId={workspaceId}
            viewerRole={viewerRole}
            roleOverrides={coerceRoleOverrides(workspace.permissionOverrides)}
            members={members.map((m) => ({
                id: m.id,
                role: m.workspaceRole,
                designation: m.designation,
                name: m.user?.surname || m.user?.name || m.user?.email || "Unknown",
                email: m.user?.email ?? null,
                overrides: coerceMemberOverrides(m.permissionOverrides),
            }))}
        />
    );
}

export default async function PermissionsPage({ params }: PermissionsPageProps) {
    const { workspaceId } = await params;

    return (
        <div className="w-full">
            <Suspense fallback={<AppLoader />}>
                <PermissionsContent workspaceId={workspaceId} />
            </Suspense>
        </div>
    );
}
