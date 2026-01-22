'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPurchaseOrder } from '@/actions/procurement/create-purchase-order';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { IconTrash, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import { POItemRow } from './columns';
import { createPOFormSchema, CreatePOInput } from '@/lib/zodSchemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

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
    const [step, setStep] = useState<1 | 2>(1);

    useEffect(() => {
        if (!open) {
            setStep(1); // Reset step on close
        }
    }, [open]);

    useEffect(() => {
        if (open && selectedItems.length > 0) {
            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;

            // Fetch PO number from server action (Prisma can't run in browser)
            import('@/actions/procurement/get-next-po-number').then(({ getNextPONumber }) => {
                getNextPONumber(workspaceId)
                    .then((poNumber) => {
                        console.log('✅ Generated PO number:', poNumber);
                        setNextPONumber(poNumber);
                    })
            });
        }
    }, [open, selectedItems, workspaceId])

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

    const form = useForm<CreatePOInput>({
        resolver: zodResolver(createPOFormSchema),
        defaultValues: {
            vendorId: commonVendor?.id || '',
            projectId: commonProject?.id || '',
            deliveryAddress: '',
            deliveryAddressLine2: '',
            deliveryCity: '',
            deliveryState: '',
            deliveryCountry: '',
            deliveryPincode: '',
            termsAndConditions: '',
            terms: ['Supply should be as per specifications', 'Payment within 30 days of delivery'], // Default terms
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

    const { fields: itemFields, remove: removeItem } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const { fields: termFields, append: appendTerm, remove: removeTerm, move: moveTerm } = useFieldArray({
        control: form.control,
        name: 'terms' as any, // Type cast since terms is optional in schema but we treat it as array here
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

    async function onSubmit(data: CreatePOInput) {
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
                projectId: data.projectId,
                deliveryAddress: data.deliveryAddress,
                deliveryDate: data.deliveryDate,
                deliveryAddressLine2: data.deliveryAddressLine2,
                deliveryCity: data.deliveryCity,
                deliveryState: data.deliveryState,
                deliveryCountry: data.deliveryCountry,
                deliveryPincode: data.deliveryPincode,
                termsAndConditions: data.termsAndConditions,
                terms: data.terms,
                items: data.items,
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

    const handleNext = async () => {
        const isValid = await form.trigger(['vendorId', 'projectId', 'items']);
        if (isValid) {
            setStep(2);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className=" min-w-[90vw] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Purchase Order - Step {step} of 2</DialogTitle>
                    <DialogDescription>
                        {step === 1
                            ? `Review items and calculations for ${selectedItems.length} selected item(s)`
                            : 'Enter delivery information and terms'}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                        {/* STEP 1: ITEMS & HEADER */}
                        <div className={step === 1 ? 'block space-y-6' : 'hidden'}>
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
                                <FormField
                                    control={form.control}
                                    name="vendorId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Vendor *</FormLabel>
                                            <FormControl>
                                                <Select
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    disabled={true}
                                                >
                                                    <SelectTrigger className="bg-muted/50">
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
                                            </FormControl>
                                            <p className="text-xs text-muted-foreground">Fixed from selected items</p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Project */}
                                <FormField
                                    control={form.control}
                                    name="projectId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Project *</FormLabel>
                                            <FormControl>
                                                <Select
                                                    value={field.value}
                                                    onValueChange={field.onChange}
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
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

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

                            <div className="flex items-center justify-between pt-4 border-t">
                                <Label>Items</Label>
                                <span className="text-sm text-muted-foreground">{itemFields.length} item(s)</span>
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
                                            {itemFields.map((field, index) => {
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
                                                                step="0.01"
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
                                                                onClick={() => removeItem(index)}
                                                                disabled={itemFields.length === 1}
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

                        {/* STEP 2: DETAILS & TERMS */}
                        <div className={step === 2 ? 'block space-y-6' : 'hidden'}>
                            {/* Delivery Details Section */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-sm">Delivery Details</h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="deliveryDate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Expected Delivery Date *</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="date"
                                                        {...field}
                                                        value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                                                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="deliveryAddress"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Address Line 1 *</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Address Line 1" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="deliveryAddressLine2"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Address Line 2</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Address Line 2 (Optional)" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="deliveryCity"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>City *</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="City" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="deliveryState"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>State *</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="State" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="deliveryCountry"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Country *</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Country" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="deliveryPincode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Pincode</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Min 6 digits" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            {/* Terms and Conditions (Dynamic Array) */}
                            <div className="space-y-4 pt-4 border-t">
                                <div className="flex items-center justify-between">
                                    <Label>Terms & Conditions</Label>
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendTerm('')}>
                                        + Add Point
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {termFields.map((field, index) => (
                                        <div key={field.id} className="flex gap-2 items-center">
                                            <div className="flex-none text-sm text-muted-foreground w-6 text-right">
                                                {index + 1}.
                                            </div>
                                            <div className="flex-1">
                                                <FormField
                                                    control={form.control}
                                                    name={`terms.${index}` as any}
                                                    render={({ field: termField }) => (
                                                        <FormItem className="space-y-0">
                                                            <FormControl>
                                                                <Input
                                                                    {...termField}
                                                                    placeholder={`Term ${index + 1}`}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => {
                                                        if (index > 0) {
                                                            moveTerm(index, index - 1);
                                                        }
                                                    }}
                                                    disabled={index === 0}
                                                >
                                                    <IconArrowUp className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => {
                                                        if (index < termFields.length - 1) {
                                                            moveTerm(index, index + 1);
                                                        }
                                                    }}
                                                    disabled={index === termFields.length - 1}
                                                >
                                                    <IconArrowDown className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => removeTerm(index)}
                                                >
                                                    <IconTrash className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                    {termFields.length === 0 && (
                                        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                                            No terms added. Click "Add Point" to add specific terms.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            {step === 1 ? (
                                <>
                                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                        Cancel
                                    </Button>
                                    <Button type="button" onClick={handleNext}>
                                        Next
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={isPending}>
                                        Back
                                    </Button>
                                    <Button type="submit" disabled={isPending || hasMultipleVendors || hasMissingVendor}>
                                        {isPending ? 'Creating...' : 'Create Purchase Order'}
                                    </Button>
                                </>
                            )}
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
