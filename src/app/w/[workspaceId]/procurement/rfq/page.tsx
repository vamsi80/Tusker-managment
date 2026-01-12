import { getApprovedIndentItems } from "@/data/procurement";
import { ApprovedItemsTable } from "./_components/approved-items-table";
import db from "@/lib/db";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function RFQPage({ params }: PageProps) {
    const { workspaceId } = await params;

    const [items, vendors] = await Promise.all([
        getApprovedIndentItems(workspaceId),
        db.vendor.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { name: 'asc' }
        }),
    ]);

    return (
        <div className="flex-1 space-y-4">
            <ApprovedItemsTable
                data={items}
                vendors={vendors}
                workspaceId={workspaceId}
            />
        </div>
    );
}
