import { MaterialNav } from "./_components/inventory-nav";
import { InventoryHeader } from "./_components/inventory-header";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { IconLock } from "@tabler/icons-react";

interface MaterialLayoutProps {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function MaterialLayout({ children, params }: MaterialLayoutProps) {
    const { workspaceId } = await params;

    // Check if user is workspace admin
    const { isWorkspaceAdmin } = await getWorkspacePermissions(workspaceId);

    // If user is not admin, show access denied message
    if (!isWorkspaceAdmin) {
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
                            You don't have permission to access the inventory section.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Only workspace admins can manage inventory.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex items-center justify-between mb-6">
                <InventoryHeader />
                <MaterialNav workspaceId={workspaceId} />
            </div>

            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
