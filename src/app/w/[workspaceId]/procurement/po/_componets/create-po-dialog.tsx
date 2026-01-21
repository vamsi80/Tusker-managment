'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createPurchaseOrder } from '@/actions/procurement/create-purchase-order';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { IconTrash } from '@tabler/icons-react';
import { POItemRow } from './columns';

const createPOFormSchema = z.object({
    vendorId: z.string().min(1, 'Vendor is required'),
    projectId: z.string().min(1, 'Project is required'),
    items: z.array(
        z.object({
            materialId: z.string(),
            materialName: z.string(),
            unitId: z.string(),
            unitName: z.string(),
            orderedQuantity: z.number().positive(),
            unitPrice: z.number().nonnegative(),
            sgstPercent: z.number().min(0).max(100).optional(),
            cgstPercent: z.number().min(0).max(100).optional(),
            indentItemId: z.string().optional(),
        })
    ).min(1),
});

type CreatePOFormData = z.infer<typeof createPOFormSchema>;

interface CreatePODialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedItems: POItemRow[];
    workspaceId: string;
    vendors: { id: string; name: string }[];
    projects: { id: string; name: string }[];
    materials: { id: string; name: string; defaultUnitId: string | null }[];
    onSuccess?: () => void;
}

export function CreatePODialog({
    open,
    onOpenChange,
    selectedItems,
    workspaceId,
    vendors,
    projects,
    materials,
    onSuccess,
}: CreatePODialogProps) {
    const [isPending, startTransition] = useTransition();
    const [nextPONumber, setNextPONumber] = useState<string>('');

    useEffect(() => {
        if (open && selectedItems.length > 0) {
            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;
            setNextPONumber(`WT/${currentYear}-${nextYear}/000001`);
        }
    }, [open, selectedItems])

    // Group items by vendor
    const vendorGroups = selectedItems.reduce((acc, item) => {
        const vendorName = item.vendorName || 'No Vendor';
        if (!acc[vendorName]) {
            acc[vendorName] = [];
        }
        acc[vendorName].push(item);
        return acc;
    }, {} as Record<string, POItemRow[]>);

    // Check if all items have the same vendor
    const hasMultipleVendors = Object.keys(vendorGroups).length > 1;
    const hasMissingVendor = selectedItems.some(item => !item.vendorName);

    // Get the common vendor if all items have the same vendor
    const commonVendor = !hasMultipleVendors && !hasMissingVendor
        ? vendors.find(v => v.name === Object.keys(vendorGroups)[0])
        : undefined;

    // Get the common project if all items have the same project
    const projectNames = new Set(selectedItems.map(item => item.projectName));
    const commonProject = projectNames.size === 1
        ? projects.find(p => p.name === Array.from(projectNames)[0])
        : undefined;

    const form = useForm<CreatePOFormData>({
        resolver: zodResolver(createPOFormSchema),
        defaultValues: {
            vendorId: commonVendor?.id || '',
            projectId: commonProject?.id || '',
            items: selectedItems.map(item => ({
                materialId: item.materialId,
                materialName: item.materialName,
                unitId: item.unitId || '', // Use unitId from indent item
                unitName: item.unit || '',
                orderedQuantity: item.quantity,
                unitPrice: item.estimatedPrice || 0,
                sgstPercent: 9, // Default 9% SGST
                cgstPercent: 9, // Default 9% CGST
                indentItemId: item.id,
            })),
        },
    });

    const { fields, remove } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const watchedItems = form.watch('items');

    // Calculate totals
    const calculateItemTotal = (index: number) => {
        const item = watchedItems[index];
        if (!item) return { lineTotal: 0, taxAmount: 0, totalAmount: 0 };

        const lineTotal = item.orderedQuantity * item.unitPrice;
        const sgst = item.sgstPercent || 0;
        const cgst = item.cgstPercent || 0;
        const taxAmount = (lineTotal * (sgst + cgst)) / 100;
        const totalAmount = lineTotal + taxAmount;

        return {
            lineTotal: Math.round(lineTotal * 100) / 100,
            taxAmount: Math.round(taxAmount * 100) / 100,
            totalAmount: Math.round(totalAmount * 100) / 100,
        };
    };

    const calculatePOTotals = () => {
        let subtotal = 0;
        let totalTax = 0;
        let grandTotal = 0;

        watchedItems.forEach((_, index) => {
            const { lineTotal, taxAmount, totalAmount } = calculateItemTotal(index);
            subtotal += lineTotal;
            totalTax += taxAmount;
            grandTotal += totalAmount;
        });

        return {
            subtotal: Math.round(subtotal * 100) / 100,
            totalTax: Math.round(totalTax * 100) / 100,
            grandTotal: Math.round(grandTotal * 100) / 100,
        };
    };

    const totals = calculatePOTotals();

    async function onSubmit(data: CreatePOFormData) {
        if (hasMultipleVendors) {
            toast.error('Cannot create PO: Selected items have different vendors');
            return;
        }

        if (hasMissingVendor) {
            toast.error('Cannot create PO: Some items do not have a vendor assigned');
            return;
        }

        startTransition(async () => {
            const result = await createPurchaseOrder(workspaceId, {
                vendorId: data.vendorId,
                projectId: data.projectId, // Non-null assertion since Zod validates it's required
                items: data.items.map(item => ({
                    materialId: item.materialId,
                    unitId: item.unitId,
                    orderedQuantity: item.orderedQuantity,
                    unitPrice: item.unitPrice,
                    sgstPercent: item.sgstPercent,
                    cgstPercent: item.cgstPercent,
                    indentItemId: item.indentItemId,
                })),
            });

            if (result.success) {
                toast.success(result.message || 'Purchase Order created successfully');
                onOpenChange(false);
                onSuccess?.();
            } else {
                toast.error(result.error || 'Failed to create Purchase Order');
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className=" min-w-[90vw] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Purchase Order</DialogTitle>
                    <DialogDescription>
                        Create a PO for {selectedItems.length} selected item(s)
                        {selectedItems.length > 0 && (
                            <span className="ml-2 text-xs">
                                ({selectedItems.map(i => i.materialName).join(', ')})
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {hasMultipleVendors && (
                    <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                        <strong>Warning:</strong> Selected items have different vendors. Please select items from the same vendor.
                        <div className="mt-2 space-y-1">
                            {Object.entries(vendorGroups).map(([vendor, items]) => (
                                <div key={vendor}>
                                    • {vendor}: {items.length} item(s)
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {hasMissingVendor && (
                    <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                        <strong>Warning:</strong> Some items do not have a vendor assigned. Please assign vendors to all items before creating a PO.
                    </div>
                )}

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* PO Header */}
                    <div className="grid grid-cols-4 gap-4">
                        {/* PO Number */}
                        <div className="space-y-2">
                            <Label>PO Number</Label>
                            <div className="h-10 px-3 py-2 rounded-md border bg-muted/50 flex items-center text-sm font-medium">
                                {nextPONumber}
                            </div>
                            <p className="text-xs text-muted-foreground">Will be generated</p>
                        </div>

                        {/* Vendor */}
                        <div className="space-y-2">
                            <Label htmlFor="vendorId">Vendor *</Label>
                            <Select
                                value={form.watch('vendorId')}
                                onValueChange={(value) => form.setValue('vendorId', value)}
                                disabled={!!commonVendor}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select vendor" />
                                </SelectTrigger>
                                <SelectContent>
                                    {vendors.map((vendor) => (
                                        <SelectItem key={vendor.id} value={vendor.id}>
                                            {vendor.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {form.formState.errors.vendorId && (
                                <p className="text-sm text-destructive">{form.formState.errors.vendorId.message}</p>
                            )}
                        </div>

                        {/* Project */}
                        <div className="space-y-2">
                            <Label htmlFor="projectId">Project *</Label>
                            <Select
                                value={form.watch('projectId')}
                                onValueChange={(value) => form.setValue('projectId', value)}
                                disabled={!!commonProject}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select project" />
                                </SelectTrigger>
                                <SelectContent>
                                    {projects.map((project) => (
                                        <SelectItem key={project.id} value={project.id}>
                                            {project.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {form.formState.errors.projectId && (
                                <p className="text-sm text-destructive">{form.formState.errors.projectId.message}</p>
                            )}
                        </div>

                        {/* Date */}
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <div className="h-10 px-3 py-2 rounded-md border bg-muted/50 flex items-center text-sm">
                                {new Date().toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                })}
                            </div>
                            <p className="text-xs text-muted-foreground">Today</p>
                        </div>
                    </div>

                    {/* PO Items */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label>Items</Label>
                            <span className="text-sm text-muted-foreground">{fields.length} item(s)</span>
                        </div>

                        <div className="rounded-md border">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b bg-muted/50">
                                        <tr>
                                            <th className="p-2 text-left font-medium">Material</th>
                                            <th className="p-2 text-right font-medium">Qty</th>
                                            <th className="p-2 text-right font-medium">Unit Price</th>
                                            <th className="p-2 text-right font-medium">SGST %</th>
                                            <th className="p-2 text-right font-medium">CGST %</th>
                                            <th className="p-2 text-right font-medium">Subtotal</th>
                                            <th className="p-2 text-right font-medium">Tax</th>
                                            <th className="p-2 text-right font-medium">Total</th>
                                            <th className="p-2 text-center font-medium">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fields.map((field, index) => {
                                            const { lineTotal, taxAmount, totalAmount } = calculateItemTotal(index);
                                            return (
                                                <tr key={field.id} className="border-b last:border-0">
                                                    <td className="p-2">
                                                        <div className="font-medium">{watchedItems[index]?.materialName}</div>
                                                        <div className="text-xs text-muted-foreground">{watchedItems[index]?.unitName}</div>
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        <Input
                                                            type="number"
                                                            step="1"
                                                            className="w-20 text-right"
                                                            {...form.register(`items.${index}.orderedQuantity`, { valueAsNumber: true })}
                                                        />
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        <Input
                                                            className="w-24 text-right"
                                                            {...form.register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                                                        />
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            className="w-20 text-right"
                                                            {...form.register(`items.${index}.sgstPercent`, { valueAsNumber: true })}
                                                        />
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            className="w-20 text-right"
                                                            {...form.register(`items.${index}.cgstPercent`, { valueAsNumber: true })}
                                                        />
                                                    </td>
                                                    <td className="p-2 text-right font-medium">₹{lineTotal.toFixed(2)}</td>
                                                    <td className="p-2 text-right text-muted-foreground">₹{taxAmount.toFixed(2)}</td>
                                                    <td className="p-2 text-right font-semibold">₹{totalAmount.toFixed(2)}</td>
                                                    <td className="p-2 text-center">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => remove(index)}
                                                            disabled={fields.length === 1}
                                                        >
                                                            <IconTrash className="h-4 w-4" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="border-t bg-muted/30">
                                        <tr>
                                            <td colSpan={5} className="p-2 text-right font-medium">GRAND TOTAL:</td>
                                            <td className="p-2 text-right font-semibold">₹{totals.subtotal.toFixed(2)}</td>
                                            <td className="p-2 text-right font-semibold text-muted-foreground">₹{totals.totalTax.toFixed(2)}</td>
                                            <td className="p-2 text-right font-bold text-lg">₹{totals.grandTotal.toFixed(2)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isPending || hasMultipleVendors || hasMissingVendor}>
                            {isPending ? 'Creating...' : 'Create Purchase Order'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
