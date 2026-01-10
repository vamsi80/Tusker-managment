"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RfqDetails } from "@/data/procurement/get-rfq-details";
import { IconTrophy } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function ComparisonTable({ rfq }: { rfq: RfqDetails }) {
    if (rfq.vendors.length === 0) return <div className="p-4 text-center text-muted-foreground border rounded-md">No vendors to compare.</div>;

    // Process data for easier rendering
    const vendorColumns = rfq.vendors.map(v => {
        const quote = rfq.quotations.find(q => q.vendorId === v.id);
        const quoteItems = quote?.items || [];
        const totalAmount = quoteItems.reduce((sum, item) => {
            const rfqItem = rfq.items.find(i => i.id === item.rfqItemId);
            return sum + (item.unitPrice * (rfqItem?.quantity || 0));
        }, 0);
        return { vendor: v, quote, items: quoteItems, total: totalAmount };
    });

    // Find Lowest Total (L1) based on valid quotes
    const vendorsWithQuotes = vendorColumns.filter(v => v.total > 0);
    const minTotal = vendorsWithQuotes.length > 0 ? Math.min(...vendorsWithQuotes.map(v => v.total)) : -1;

    return (
        <div className="rounded-md border overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[300px]">Item Details</TableHead>
                        {vendorColumns.map(({ vendor, total }) => (
                            <TableHead key={vendor.id} className={cn("text-right min-w-[180px]", total === minTotal && total > 0 && "bg-green-500/10")}>
                                <div className="flex flex-col gap-1 py-2 h-full justify-between">
                                    <div>
                                        <span className="font-bold text-foreground block truncate" title={vendor.name}>{vendor.name}</span>
                                        {vendor.companyName && <span className="text-xs font-normal text-muted-foreground block truncate" title={vendor.companyName}>{vendor.companyName}</span>}
                                    </div>
                                    {total === minTotal && total > 0 && (
                                        <Badge variant="secondary" className="w-fit ml-auto bg-green-100 text-green-700 pointer-events-none border-0 mt-1">
                                            <IconTrophy className="h-3 w-3 mr-1" /> L1
                                        </Badge>
                                    )}
                                </div>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rfq.items.map(item => {
                        // Find min price for this item across vendors
                        const prices = vendorColumns.map(vc => vc.items.find(i => i.rfqItemId === item.id)?.unitPrice).filter(p => p !== undefined) as number[];
                        const minPrice = prices.length > 0 ? Math.min(...prices) : -1;

                        return (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <div className="font-medium">{item.indentItem.material.name}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        Qty: <span className="font-semibold text-foreground">{item.quantity}</span> {item.indentItem.unit?.abbreviation}
                                    </div>
                                </TableCell>
                                {vendorColumns.map(({ vendor, items }) => {
                                    const quoteItem = items.find(i => i.rfqItemId === item.id);
                                    const price = quoteItem?.unitPrice;
                                    const isLowest = price === minPrice && minPrice !== -1;

                                    return (
                                        <TableCell key={vendor.id} className={cn("text-right", isLowest && "bg-green-500/5")}>
                                            {price !== undefined ? (
                                                <div className="flex flex-col">
                                                    <span className={cn("font-medium", isLowest && "text-green-700")}>
                                                        {price.toFixed(2)}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {(price * item.quantity).toFixed(2)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        );
                    })}
                    <TableRow className="bg-muted/50 hover:bg-muted/50 font-bold border-t-2">
                        <TableCell>Grand Total</TableCell>
                        {vendorColumns.map(({ vendor, total }) => (
                            <TableCell key={vendor.id} className={cn("text-right text-lg", total === minTotal && total > 0 && "text-green-700 bg-green-500/10")}>
                                {total > 0 ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    );
}
