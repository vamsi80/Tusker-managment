"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createQuotation } from "@/actions/procurement/create-quotation";
import { toast } from "sonner";
import { IconLoader2 } from "@tabler/icons-react";
import { Vendor, Quotation, QuotationItem } from "@/generated/prisma";

interface RfqItemData {
    id: string;
    quantity: number;
    indentItem: {
        material: { name: string };
        unit: { abbreviation: string } | null;
    }
}

interface EnterQuoteDialogProps {
    vendor: Vendor;
    rfqItems: RfqItemData[];
    existingQuote?: (Quotation & { items: QuotationItem[] }) | null;
    rfqId: string;
    workspaceId: string;
    trigger?: React.ReactNode;
}

export function EnterQuoteDialog({ vendor, rfqItems, existingQuote, rfqId, workspaceId, trigger }: EnterQuoteDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [prices, setPrices] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        if (existingQuote) {
            existingQuote.items.forEach(q => {
                init[q.rfqItemId] = q.unitPrice.toString();
            });
        }
        return init;
    });

    const handleSave = async () => {
        setLoading(true);
        const itemsToSave = Object.entries(prices)
            .filter(([_, price]) => price && !isNaN(parseFloat(price)))
            .map(([rfqItemId, price]) => ({
                rfqItemId,
                unitPrice: parseFloat(price)
            }));

        if (itemsToSave.length === 0) {
            toast.error("Please enter at least one price");
            setLoading(false);
            return;
        }

        const res = await createQuotation({
            rfqId,
            vendorId: vendor.id,
            items: itemsToSave,
            workspaceId
        });

        setLoading(false);
        if (res.success) {
            toast.success("Quotation saved successfully");
            setOpen(false);
        } else {
            toast.error(res.error || "Failed to save quotation");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || <Button variant="outline" size="sm">Enter Quote</Button>}
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Enter Quote for {vendor.name}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="rounded-md border">
                        <div className="grid grid-cols-12 gap-4 p-3 font-medium bg-muted/50 border-b">
                            <div className="col-span-4">Item</div>
                            <div className="col-span-2 text-right">Qty</div>
                            <div className="col-span-3 text-right">Unit Price</div>
                            <div className="col-span-3 text-right">Total</div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {rfqItems.map((item) => {
                                const price = parseFloat(prices[item.id] || "0");
                                const total = price * item.quantity;
                                return (
                                    <div key={item.id} className="grid grid-cols-12 gap-4 p-3 items-center border-b last:border-0 hover:bg-muted/10">
                                        <div className="col-span-4">
                                            <div className="font-medium text-sm">{item.indentItem.material.name}</div>
                                            <div className="text-xs text-muted-foreground">{item.indentItem.unit?.abbreviation}</div>
                                        </div>
                                        <div className="col-span-2 text-right text-sm">
                                            {item.quantity}
                                        </div>
                                        <div className="col-span-3">
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="text-right h-8"
                                                value={prices[item.id] || ""}
                                                onChange={(e) => setPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                                            />
                                        </div>
                                        <div className="col-span-3 text-right font-medium text-sm">
                                            {total > 0 ? total.toFixed(2) : "-"}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 text-sm">
                        <span className="text-muted-foreground">Grand Total:</span>
                        <span className="font-bold">
                            {rfqItems.reduce((acc, item) => {
                                const price = parseFloat(prices[item.id] || "0");
                                return acc + (price * item.quantity);
                            }, 0).toFixed(2)}
                        </span>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Quote
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
