import { ProcurementNav } from "./_components/procurement-nav";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { IconLock } from "@tabler/icons-react";

interface ProcurementLayoutProps {
    children: React.ReactNode;
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function ProcurementLayout({
    children,
    params,
}: ProcurementLayoutProps) {
    const { workspaceId } = await params;

    // Check if user has procurement access
    const { hasAccess } = await getWorkspacePermissions(workspaceId);

    // If user doesn't have access, show access denied message
    if (!hasAccess) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md">
                    <div className="flex justify-center">
                        <div className="rounded-full bg-muted p-6">
                            <IconLock className="h-12 w-12 text-muted-foreground" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight">Access Restricted</h2>
                        <p className="text-muted-foreground">
                            You don't have permission to access the procurement section.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Only workspace admins and project leads can access procurement features.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Procurement</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage material indent requests and procurement decisions
                    </p>
                </div>
            </div>

            <ProcurementNav workspaceId={workspaceId} />

            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
