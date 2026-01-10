import { getRfqDetails } from "@/data/procurement/get-rfq-details";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { EnterQuoteDialog } from "./_components/enter-quote-dialog";
import { ComparisonTable } from "./_components/comparison-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBuildingStore, IconArrowLeft } from "@tabler/icons-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

interface PageProps {
    params: Promise<{
        workspaceId: string;
        rfqId: string;
    }>;
}

export default async function RfqDetailsPage({ params }: PageProps) {
    const { workspaceId, rfqId } = await params;

    const rfq = await getRfqDetails(rfqId);
    if (!rfq) return notFound();

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <Link
                        href={`/w/${workspaceId}/procurement/rfq`}
                        className="p-1 -ml-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Back to RFQs"
                    >
                        <IconArrowLeft className="h-5 w-5" />
                    </Link>
                    <h2 className="text-2xl font-bold tracking-tight">{rfq.key}</h2>
                    <Badge variant="outline">{rfq.status}</Badge>
                </div>
                <div className="text-muted-foreground text-sm pl-7">
                    Created on {format(new Date(rfq.createdAt), "PPP")}
                    {rfq.deadline && ` • Deadline: ${format(new Date(rfq.deadline), "PPP")}`}
                </div>
            </div>

            <Tabs defaultValue="quotes">
                <TabsList>
                    <TabsTrigger value="quotes">Manage Quotes</TabsTrigger>
                    <TabsTrigger value="comparison">Comparison & Analysis</TabsTrigger>
                </TabsList>

                <TabsContent value="quotes" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Quotations</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <div className="grid grid-cols-12 gap-4 p-3 font-medium bg-muted/50 border-b">
                                    <div className="col-span-5">Vendor</div>
                                    <div className="col-span-3">Status</div>
                                    <div className="col-span-2 text-right">Total Amount</div>
                                    <div className="col-span-2 text-right">Action</div>
                                </div>
                                {rfq.vendors.length === 0 && <div className="p-4 text-center text-muted-foreground">No vendors linked.</div>}
                                {rfq.vendors.map(vendor => {
                                    const quote = rfq.quotations.find(q => q.vendorId === vendor.id);
                                    // Calculate total amount from quote items
                                    const totalAmount = quote?.items.reduce((sum, item) => {
                                        const rfqItem = rfq.items.find(i => i.id === item.rfqItemId);
                                        return sum + (item.unitPrice * (rfqItem?.quantity || 0));
                                    }, 0) || 0;

                                    return (
                                        <div key={vendor.id} className="grid grid-cols-12 gap-4 p-3 items-center border-b last:border-0 hover:bg-muted/[0.02]">
                                            <div className="col-span-5 flex items-center gap-2">
                                                <div className="bg-primary/10 p-2 rounded-full">
                                                    <IconBuildingStore className="h-4 w-4 text-primary" />
                                                </div>
                                                <div>
                                                    <div className="font-medium">{vendor.name}</div>
                                                    {vendor.companyName && <div className="text-xs text-muted-foreground">{vendor.companyName}</div>}
                                                </div>
                                            </div>
                                            <div className="col-span-3">
                                                {quote ? (
                                                    <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 border-0">Quote Received</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                                                )}
                                            </div>
                                            <div className="col-span-2 text-right font-medium">
                                                {quote ? totalAmount.toFixed(2) : "-"}
                                            </div>
                                            <div className="col-span-2 flex justify-end">
                                                <EnterQuoteDialog
                                                    vendor={vendor}
                                                    rfqItems={rfq.items}
                                                    existingQuote={quote}
                                                    rfqId={rfq.id}
                                                    workspaceId={workspaceId}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="comparison" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Comparative Statement</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ComparisonTable rfq={rfq} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
