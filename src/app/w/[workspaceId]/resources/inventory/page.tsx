import { CreateMaterialForm } from "./_components/create-material-form";
import { getUnits } from "@/data/inventory/units";

interface InventoryPageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function InventoryPage({ params }: InventoryPageProps) {
    const { workspaceId } = await params;

    // Fetch units from database
    const units = await getUnits();

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
                <CreateMaterialForm
                    workspaceId={workspaceId}
                    units={units}
                />
            </div>

            {/* Material List will go here */}
            <div className="rounded-md border p-8 text-center text-muted-foreground">
                <p>No materials found. Click "Add Material" to get started.</p>
            </div>
        </div>
    );
}