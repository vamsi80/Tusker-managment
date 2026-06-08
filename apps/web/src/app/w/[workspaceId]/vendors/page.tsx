import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { VendorsTable } from "./_components/vendors-table";

export default async function VendorsPage({
    params,
}: {
    params: Promise<{ workspaceId: string }>;
}) {
    const { workspaceId } = await params;

    const { data: vendors = [] } = await serverApiFetch<{ success: boolean; data: any[] }>(
        `/procurement/vendors?w=${workspaceId}`
    ).catch(() => ({ data: [] as any[] }));

    return <VendorsTable workspaceId={workspaceId} initialVendors={vendors} />;
}
