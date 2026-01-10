import { getApprovedIndentItems } from "@/data/procurement/get-approved-items";
import { ApprovedItemsTable } from "./_components/approved-items-table";
import { getRfqs } from "@/data/procurement/get-rfqs";
import { RfqList } from "./_components/rfq-list";
import db from "@/lib/db";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PageProps {
    params: Promise<{
        workspaceId: string;
    }>;
}

export default async function RFQPage({ params }: PageProps) {
    const { workspaceId } = await params;

    const [items, vendors, rfqs] = await Promise.all([
        getApprovedIndentItems(workspaceId),
        db.vendor.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { name: 'asc' }
        }),
        getRfqs(workspaceId)
    ]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">Request for Quotation (RFQ)</h2>
            </div>

            <Tabs defaultValue="pending">
                <TabsList>
                    <TabsTrigger value="pending">Pending Items ({items.length})</TabsTrigger>
                    <TabsTrigger value="rfqs">Active RFQs ({rfqs.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="pending" className="mt-4">
                    <ApprovedItemsTable
                        data={items}
                        vendors={vendors}
                        workspaceId={workspaceId}
                    />
                </TabsContent>
                <TabsContent value="rfqs" className="mt-4">
                    <RfqList data={rfqs} />
                </TabsContent>
            </Tabs>
        </div>
    );
}