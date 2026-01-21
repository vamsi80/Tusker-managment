import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { DeliveriesClientPage } from "./_components/client";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function DeliveriesPage({ params }: PageProps) {
    const { workspaceId } = await params;

    // Fetch workspace members for permissions
    const workspaceMembersResult = await getWorkspaceMembers(workspaceId);

    // TODO: Fetch Purchase Orders with items
    // const purchaseOrders = await getPurchaseOrders(workspaceId);

    // Temporary empty data until PO model is migrated
    const purchaseOrders: any[] = [];

    return (
        <DeliveriesClientPage
            data={purchaseOrders}
            userRole={workspaceMembersResult.workspaceMembers[0]?.workspaceRole || 'MEMBER'}
            workspaceId={workspaceId}
        />
    );
}
