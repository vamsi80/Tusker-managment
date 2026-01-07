import { Metadata } from "next";
import { MaterialNav } from "./_components/resourse-nav";
import { InventoryHeader } from "./_components/inventory-header";

// export const metadata: Metadata = {
//     title: "Inventory | Tusker",
//     description: "Manage procurement and materials",
// };

interface MaterialLayoutProps {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
}

export default async function MaterialLayout({ children, params }: MaterialLayoutProps) {
    const { workspaceId } = await params;

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
