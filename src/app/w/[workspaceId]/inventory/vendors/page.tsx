import { getVendors } from "@/data/inventory/vendors";
import { getMaterials } from "@/data/inventory/materials";
import { VendorsTable } from "./_components/vendors-table";
import { CreateVendorForm } from "./_components/create-vendor-form";
import { IconBuildingStore } from "@tabler/icons-react";

interface VendorsPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function VendorsPage({ params }: VendorsPageProps) {
    const { workspaceId } = await params;
    const vendors = await getVendors(workspaceId);
    const materials = await getMaterials(workspaceId);

    // Empty state logic remains, but simplified
    if (vendors.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 border-2 border-dashed rounded-lg bg-muted/10">
                <div className="p-4 rounded-full bg-muted/30 text-muted-foreground">
                    <IconBuildingStore className="w-12 h-12" />
                </div>
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight">No vendors found</h2>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                        You haven't added any vendors yet. Add vendors to track suppliers and manage procurement.
                    </p>
                </div>
                <CreateVendorForm workspaceId={workspaceId} materials={materials} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <VendorsTable data={vendors} workspaceId={workspaceId} materials={materials} />
        </div>
    );
}