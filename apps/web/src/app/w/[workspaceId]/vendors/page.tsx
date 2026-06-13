import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { VendorsTable } from "./_components/vendors-table";

export default async function VendorsPage({
    params,
}: {
    params: Promise<{ workspaceId: string }>;
}) {
    const { workspaceId } = await params;

    const { data: vendors = [] } = await serverApiFetch<{ success: boolean; data: Array<{ id: string; name: string; companyName?: string | null; email?: string | null; phoneNumber?: string | null; city?: string | null; state?: string | null; contactPerson?: string | null; gstNumber?: string | null; status: string }> }>(
        `/procurement/vendors?w=${workspaceId}`
    ).catch(() => ({ data: [] }));

    return <VendorsTable workspaceId={workspaceId} initialVendors={vendors} />;
}
