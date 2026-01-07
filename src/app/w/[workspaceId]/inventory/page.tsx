import { getUnits } from "@/data/inventory/units";
import { getMaterials } from "@/data/inventory/materials"; // Check if this file exists from step 818
import { isAdminServer } from "@/lib/auth/requireAdmin";
import { MaterialsTable } from "./_components/inventory/materials-table";

interface InventoryPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function InventoryPage({ params }: InventoryPageProps) {
    const { workspaceId } = await params;

    // Fetch data in parallel
    const [units, materials, isAdmin] = await Promise.all([
        getUnits(),
        getMaterials(workspaceId),
        isAdminServer(workspaceId),
    ]);

    return (
        <div className="space-y-6">
            <MaterialsTable
                data={materials}
                workspaceId={workspaceId}
                isAdmin={isAdmin}
                units={units}
            />
        </div>
    );
}
