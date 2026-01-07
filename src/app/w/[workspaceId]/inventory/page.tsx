import { redirect } from "next/navigation";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function InventoryPage({ params }: PageProps) {
    const { workspaceId } = await params;
    return (
        <div>
            <h1>inventory Page</h1>
        </div>
    );
}
