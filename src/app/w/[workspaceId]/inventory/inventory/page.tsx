import { Suspense } from "react";
import { CreateMaterialForm } from "./_components/create-material-form";
import { MaterialsTable } from "./_components/materials-table";
import { getUnits } from "@/data/inventory/units";
import { getMaterials } from "@/data/inventory/materials"; // Check if this file exists from step 818
import { isAdminServer } from "@/lib/auth/requireAdmin";

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
            {/* Header with Add Material Button */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
                    <p className="text-muted-foreground text-sm">
                        Manage your materials and stock levels
                    </p>
                </div>
            </div>

            {/* Material List Table */}
            <MaterialsTable
                data={materials}
                workspaceId={workspaceId}
                isAdmin={isAdmin}
                units={units}
            />
        </div>
    );
}
