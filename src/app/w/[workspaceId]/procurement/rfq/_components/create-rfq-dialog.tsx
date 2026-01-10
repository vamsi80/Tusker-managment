"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Vendor } from "@/generated/prisma";
import { ApprovedIndentItemWithRelations } from "@/data/procurement/get-approved-items";
import { createRfq } from "@/actions/procurement/create-rfq";
import { toast } from "sonner";
import { IconLoader2 } from "@tabler/icons-react";

interface CreateRfqDialogProps {
    items: ApprovedIndentItemWithRelations[];
    vendors: Vendor[];
    workspaceId: string;
    onClose?: () => void;
    trigger?: React.ReactNode;
}

export function CreateRfqDialog({ items, vendors, workspaceId, trigger, onClose }: CreateRfqDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deadline, setDeadline] = useState<string>("");
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);

    const handleCreate = async () => {
        if (items.length === 0) return;
        if (selectedVendors.length === 0) {
            toast.error("Please select at least one vendor");
            return;
        }

        setLoading(true);
        const res = await createRfq({
            workspaceId,
            itemIds: items.map(i => i.id),
            vendorIds: selectedVendors,
            deadline: deadline ? new Date(deadline) : undefined
        });

        setLoading(false);
        if (res.success) {
            toast.success("RFQ created successfully");
            setOpen(false);
            if (onClose) onClose();
        } else {
            toast.error(res.error || "Failed to create RFQ");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || <Button disabled={items.length === 0}>Create RFQ</Button>}
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Create RFQ</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="text-sm font-medium">
                        Creating RFQ for <span className="text-primary">{items.length}</span> items.
                    </div>

                    <div className="space-y-2">
                        <Label>Deadline (Optional)</Label>
                        <Input
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Select Vendors</Label>
                        <div className="border rounded-md p-2">
                            <ScrollArea className="h-[200px]">
                                <div className="space-y-2 p-1">
                                    {vendors.length === 0 && <p className="text-sm text-muted-foreground p-2">No vendors found.</p>}
                                    {vendors.map(vendor => (
                                        <div key={vendor.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={vendor.id}
                                                checked={selectedVendors.includes(vendor.id)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) setSelectedVendors([...selectedVendors, vendor.id]);
                                                    else setSelectedVendors(selectedVendors.filter(id => id !== vendor.id));
                                                }}
                                            />
                                            <Label htmlFor={vendor.id} className="cursor-pointer font-normal text-sm">
                                                {vendor.name}
                                                {vendor.companyName && <span className="text-muted-foreground ml-1">({vendor.companyName})</span>}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={loading || items.length === 0}>
                        {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create RFQ
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
