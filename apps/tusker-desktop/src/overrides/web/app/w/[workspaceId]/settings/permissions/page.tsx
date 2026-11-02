// Desktop copy of apps/web/src/app/w/[workspaceId]/settings/permissions/page.tsx: identical except the inline prisma
// queries, which run on the API (apps/api .../routes/desktop.ts) unchanged.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { AppLoader } from "@/components/shared/app-loader";
import { PermissionsManager } from "@/app/w/[workspaceId]/settings/_components/permissions/permissions-manager";
import { api } from "~/overrides/web/lib/desktop-api";

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

    // The same two queries, already mapped the same way, from the API's permissions route.
    const grid = await api<{ roleOverrides: any; members: any[] }>(`/workspace-admin/${workspaceId}/permissions`).catch(() => null);

    if (!grid) redirect(`/w/${workspaceId}/settings`);

    return (
        <PermissionsManager
            workspaceId={workspaceId}
            viewerRole={viewerRole}
            roleOverrides={grid.roleOverrides}
            members={grid.members}
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
