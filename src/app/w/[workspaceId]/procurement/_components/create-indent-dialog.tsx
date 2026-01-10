"use client";

import { useState, useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { IconPlus, IconLoader2, IconArrowLeft, IconArrowRight, IconCheck, IconTrash, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createIndentRequest } from "@/actions/procurement/create-indent-request";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import React from "react";

// Step 1: Basic Information Schema (All users)
const step1Schema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    projectId: z.string().min(1, "Project is required"),
    taskId: z.string().optional(),
    description: z.string().optional(),
    expectedDelivery: z.date({ message: "Expected delivery date is required" }),
    requiresVendor: z.boolean(),
});

// Step 2: Material Selection Schema (Admin/Owner only)
const materialItemSchema = z.object({
    materialId: z.string().min(1, "Material is required"),
    quantity: z.number().min(0.01, "Quantity must be greater than 0"),
    unitId: z.string().optional(),
    vendorId: z.string().optional(),
    estimatedPrice: z.number().optional(),
}).refine((data) => {
    if (data.vendorId && (!data.estimatedPrice || data.estimatedPrice <= 0)) {
        return false;
    }
    return true;
}, {
    message: "Price is required when vendor is selected",
    path: ["estimatedPrice"]
});

const step2Schema = z.object({
    materials: z.array(materialItemSchema).min(1, "At least one material is required"),
});

// Combined schema for final submission
const indentRequestSchema = step1Schema.merge(step2Schema.partial());

type IndentRequestFormData = z.infer<typeof indentRequestSchema>;
type MaterialItem = z.infer<typeof materialItemSchema>;

interface CreateIndentDialogProps {
    workspaceId: string;
    projects: { id: string; name: string }[];
    tasks?: { id: string; name: string; projectId: string }[];
    materials?: { id: string; name: string; defaultUnitId: string; vendors?: { id: string; name: string }[] }[];
    units?: { id: string; name: string; abbreviation: string }[];
    vendors?: { id: string; name: string }[];
    trigger?: React.ReactNode;
    userRole?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    defaultProjectId?: string;
    defaultTaskId?: string;
}

export function CreateIndentDialog({
    workspaceId,
    projects,
    tasks = [],
    materials = [],
    units = [],
    vendors = [],
    trigger,
    userRole = "MEMBER",
    defaultProjectId,
    defaultTaskId
}: CreateIndentDialogProps) {
    const [open, setOpen] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [pending, startTransition] = useTransition();

    const isAdminOrOwner = userRole === "OWNER" || userRole === "ADMIN";
    const totalSteps = isAdminOrOwner ? 3 : 2; // Members skip material selection

    const form = useForm<IndentRequestFormData>({
        resolver: zodResolver(indentRequestSchema),
        defaultValues: {
            name: "",
            projectId: defaultProjectId || "",
            taskId: defaultTaskId,
            description: "",
            expectedDelivery: undefined,
            materials: [{ materialId: "", quantity: 1, unitId: undefined, vendorId: undefined, estimatedPrice: undefined }],
            requiresVendor: true,
        },
        mode: "onChange",
    });

    useEffect(() => {
        if (open) {
            form.reset({
                name: "",
                projectId: defaultProjectId || "",
                taskId: defaultTaskId, // ensure this is passed correctly
                description: "",
                expectedDelivery: undefined,
                materials: [{ materialId: "", quantity: 1, unitId: undefined, vendorId: undefined, estimatedPrice: undefined }],
                requiresVendor: true,
            });
        }
    }, [open, defaultProjectId, defaultTaskId, form]);

    const selectedProjectId = form.watch("projectId");
    const filteredTasks = tasks.filter((task) => task.projectId === selectedProjectId);
    const materialsList = form.watch("materials") || [];
    const requiresVendor = form.watch("requiresVendor");

    const addMaterial = () => {
        const current = form.getValues("materials") || [];
        form.setValue("materials", [...current, { materialId: "", quantity: 1, unitId: undefined, vendorId: undefined, estimatedPrice: undefined }]);
    };

    const removeMaterial = (index: number) => {
        const current = form.getValues("materials") || [];
        if (current.length > 1) {
            form.setValue("materials", current.filter((_, i) => i !== index));
        }
    };

    const validateStep = async (step: number): Promise<boolean> => {
        let fields: (keyof IndentRequestFormData)[] = [];

        switch (step) {
            case 1:
                fields = ["name", "projectId", "requiresVendor"];
                break;
            case 2:
                if (isAdminOrOwner) {
                    fields = ["materials"];
                }
                break;
            default:
                return true;
        }

        const result = await form.trigger(fields);
        return result;
    };

    const handleNext = async (e?: React.MouseEvent) => {
        e?.preventDefault();
        const isValid = await validateStep(currentStep);
        if (isValid && currentStep < totalSteps) {
            // Skip step 2 for members
            if (currentStep === 1 && !isAdminOrOwner) {
                setCurrentStep(3);
            } else {
                setCurrentStep(currentStep + 1);
            }
        }
    };

    const handleBack = (e?: React.MouseEvent) => {
        e?.preventDefault();
        if (currentStep > 1) {
            // Skip step 2 for members when going back
            if (currentStep === 3 && !isAdminOrOwner) {
                setCurrentStep(1);
            } else {
                setCurrentStep(currentStep - 1);
            }
        }
    };

    const onSubmit = (data: IndentRequestFormData) => {
        startTransition(async () => {
            try {
                const result = await createIndentRequest({
                    workspaceId,
                    ...data,
                    // Members don't provide materials
                    materials: isAdminOrOwner ? data.materials : undefined,
                    // Ensure requiresVendor is always boolean
                    requiresVendor: data.requiresVendor ?? true,
                });

                if (result.success) {
                    toast.success("Indent request created successfully!");
                    setOpen(false);
                    form.reset();
                    setCurrentStep(1);
                } else {
                    toast.error(result.error || "Failed to create indent request");
                }
            } catch (error) {
                toast.error("An unexpected error occurred");
                console.error(error);
            }
        });
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            setTimeout(() => {
                form.reset();
                setCurrentStep(1);
            }, 200);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button>
                        <IconPlus className="mr-2 h-4 w-4" />
                        Create Indent Request
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader>
                    <DialogTitle>Create Indent Request</DialogTitle>
                    <DialogDescription>
                        Step {currentStep} of {totalSteps}: {
                            currentStep === 1 ? "Basic Information" :
                                currentStep === 2 ? "Material Selection" :
                                    "Review & Submit"
                        }
                    </DialogDescription>
                </DialogHeader>

                {/* Progress Indicator */}
                <div className="flex items-center justify-between mb-6">
                    {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
                        <div key={step} className="flex items-center flex-1">
                            <div
                                className={cn(
                                    "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                                    currentStep >= step
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-muted-foreground/30 text-muted-foreground"
                                )}
                            >
                                {currentStep > step ? (
                                    <IconCheck className="h-4 w-4" />
                                ) : (
                                    <span className="text-sm font-medium">{step}</span>
                                )}
                            </div>
                            {step < totalSteps && (
                                <div
                                    className={cn(
                                        "flex-1 h-0.5 mx-2 transition-colors",
                                        currentStep > step ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                />
                            )}
                        </div>
                    ))}
                </div>

                <Form {...form}>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            // Only submit if we're on the last step
                            if (currentStep !== totalSteps) {
                                console.log('Blocked submission - not on final step. Current:', currentStep, 'Total:', totalSteps);
                                return false;
                            }

                            // Proceed with submission
                            form.handleSubmit(onSubmit)(e);
                        }}
                        className="space-y-4"
                        onKeyDown={(e) => {
                            // Prevent Enter key from submitting the form
                            if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName !== 'BUTTON') {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                        }}
                    >
                        {/* Step 1: Basic Information */}
                        {currentStep === 1 && (
                            <div className="space-y-4 animate-in fade-in-50 duration-300">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Indent Name <span className="text-red-500">*</span></FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="e.g., Cement for Foundation Work"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-3 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="projectId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Project <span className="text-red-500">*</span></FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    disabled={!!defaultProjectId}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="w-full overflow-hidden">
                                                            <SelectValue placeholder="Select project" className="truncate" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {projects.map((project) => (
                                                            <SelectItem key={project.id} value={project.id}>
                                                                {project.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="taskId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Task (Optional)</FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    disabled={!!defaultTaskId || !selectedProjectId}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="w-full overflow-hidden">
                                                            <SelectValue
                                                                placeholder={
                                                                    selectedProjectId ? "Select task" : "Select project first"
                                                                }
                                                                className="truncate"
                                                            />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {filteredTasks.map((task) => (
                                                            <SelectItem key={task.id} value={task.id}>
                                                                {task.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="expectedDelivery"
                                        render={({ field }) => {
                                            const [isOpen, setIsOpen] = React.useState(false);

                                            return (
                                                <FormItem className="flex flex-col">
                                                    <FormLabel>Expected Delivery <span className="text-red-500">*</span></FormLabel>
                                                    <Popover open={isOpen} onOpenChange={setIsOpen}>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button
                                                                    variant="outline"
                                                                    className={cn(
                                                                        "w-full min-w-0 pl-3 text-left font-normal",
                                                                        !field.value && "text-muted-foreground"
                                                                    )}
                                                                >
                                                                    <span className="truncate block">
                                                                        {field.value ? (
                                                                            format(field.value, "PPP")
                                                                        ) : (
                                                                            "Pick a date *"
                                                                        )}
                                                                    </span>
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0" align="start">
                                                            <Calendar
                                                                mode="single"
                                                                selected={field.value}
                                                                onSelect={(date) => {
                                                                    field.onChange(date);
                                                                    setIsOpen(false);
                                                                }}
                                                                disabled={(date) => date < new Date()}
                                                                initialFocus
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                    <FormMessage />
                                                </FormItem>
                                            );
                                        }}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description (Optional)</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Provide details about this indent request..."
                                                    rows={3}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Requires Vendor Checkbox (Moved to Step 1) */}
                                <FormField
                                    control={form.control}
                                    name="requiresVendor"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 bg-muted/20">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel className="text-sm font-medium">
                                                    Requires Vendor
                                                </FormLabel>
                                                <FormDescription className="text-xs text-muted-foreground">
                                                    Check if vendor quotation is required for this indent
                                                </FormDescription>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}

                        {/* Step 2: Material Selection (Admin/Owner only) */}
                        {currentStep === 2 && isAdminOrOwner && (
                            <div className="space-y-3 animate-in fade-in-50 duration-300">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Materials Required</h3>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={addMaterial}
                                        className="h-7 text-xs"
                                    >
                                        <IconPlus className="h-3 w-3 mr-1" />
                                        Add
                                    </Button>
                                </div>

                                {/* Requires Vendor Checkbox */}
                                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                    {materialsList.map((_, index) => (
                                        <div key={index} className="group relative bg-muted/30 hover:bg-muted/50 border rounded-md py-2 pl-2 pr-4 transition-colors">
                                            {materialsList.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute -top-1 -right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background border shadow-sm"
                                                    onClick={() => removeMaterial(index)}
                                                >
                                                    <IconX className="h-3 w-3" />
                                                </Button>
                                            )}

                                            <div className="flex items-center justify-between gap-2">
                                                <div className="w-30">
                                                    <FormField
                                                        control={form.control}
                                                        name={`materials.${index}.materialId`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <Select
                                                                    onValueChange={(value) => {
                                                                        field.onChange(value);

                                                                        // Find selected material and auto-select its default unit
                                                                        const selectedMaterial = materials.find(m => m.id === value);
                                                                        if (selectedMaterial?.defaultUnitId) {
                                                                            form.setValue(`materials.${index}.unitId`, selectedMaterial.defaultUnitId);
                                                                        }

                                                                        // Reset vendor and price when material changes
                                                                        form.setValue(`materials.${index}.vendorId`, "");
                                                                        form.setValue(`materials.${index}.estimatedPrice`, undefined);
                                                                    }}
                                                                    value={field.value}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger className="h-8 text-xs w-full overflow-hidden">
                                                                            <SelectValue placeholder="Select material..." className="truncate block" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {materials.map((material) => (
                                                                            <SelectItem
                                                                                key={material.id}
                                                                                value={material.id}
                                                                                className="text-xs"
                                                                                title={material.name}
                                                                            >
                                                                                <span className="truncate block max-w-[200px]">
                                                                                    {material.name}
                                                                                </span>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage className="text-[10px]" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                {requiresVendor && (
                                                    <>
                                                        <div className="w-32">
                                                            <FormField
                                                                control={form.control}
                                                                name={`materials.${index}.vendorId`}
                                                                render={({ field }) => {
                                                                    const selectedMaterialId = materialsList[index]?.materialId;
                                                                    const selectedMaterial = materials.find(m => m.id === selectedMaterialId);
                                                                    const materialVendors = selectedMaterial?.vendors || [];

                                                                    // Debug logging
                                                                    console.log('Debug Vendor Filtering:', {
                                                                        selectedMaterialId,
                                                                        selectedMaterial: selectedMaterial?.name,
                                                                        materialVendors,
                                                                        totalVendors: vendors.length,
                                                                        vendorsList: vendors
                                                                    });


                                                                    // Use material's linked vendors if available, otherwise fall back to all workspace vendors
                                                                    const filteredVendors = materialVendors.length > 0
                                                                        ? materialVendors
                                                                        : vendors;


                                                                    console.log('Filtered Vendors:', filteredVendors);

                                                                    return (
                                                                        <FormItem>
                                                                            <Select
                                                                                onValueChange={field.onChange}
                                                                                value={field.value || undefined}
                                                                                disabled={!selectedMaterialId}
                                                                            >
                                                                                <FormControl>
                                                                                    <SelectTrigger className="h-8 text-xs w-full overflow-hidden">
                                                                                        <SelectValue placeholder="Vendor (Opt)" className="truncate block" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    {filteredVendors.length === 0 ? (
                                                                                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                                                                            No vendors available
                                                                                        </div>
                                                                                    ) : (
                                                                                        filteredVendors.map((vendor) => (
                                                                                            <SelectItem
                                                                                                key={vendor.id}
                                                                                                value={vendor.id}
                                                                                                className="text-xs"
                                                                                                title={vendor.name}
                                                                                            >
                                                                                                <span className="truncate block max-w-[150px]">
                                                                                                    {vendor.name}
                                                                                                </span>
                                                                                            </SelectItem>
                                                                                        ))
                                                                                    )}
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <FormMessage className="text-[10px]" />
                                                                        </FormItem>
                                                                    );
                                                                }}
                                                            />
                                                        </div>

                                                        <div className="w-20">
                                                            <FormField
                                                                control={form.control}
                                                                name={`materials.${index}.estimatedPrice`}
                                                                render={({ field }) => {
                                                                    const currentVendorId = materialsList[index]?.vendorId;

                                                                    return (
                                                                        <FormItem>
                                                                            <FormControl>
                                                                                <Input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    min="0"
                                                                                    placeholder="Price"
                                                                                    className="h-8 text-xs text-right"
                                                                                    value={field.value || ""}
                                                                                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                                                                    disabled={!currentVendorId}
                                                                                />
                                                                            </FormControl>
                                                                            <FormMessage className="text-[10px]" />
                                                                        </FormItem>
                                                                    );
                                                                }}
                                                            />
                                                        </div>
                                                    </>
                                                )}

                                                <div className="w-16">
                                                    <FormField
                                                        control={form.control}
                                                        name={`materials.${index}.quantity`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        placeholder="Qty"
                                                                        className="h-8 text-xs text-center"
                                                                        {...field}
                                                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage className="text-[10px]" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                <div className="w-16">
                                                    <FormField
                                                        control={form.control}
                                                        name={`materials.${index}.unitId`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <Select onValueChange={field.onChange} value={field.value}>
                                                                    <FormControl>
                                                                        <SelectTrigger className="h-8 text-xs">
                                                                            <SelectValue placeholder="Unit" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {units.map((unit) => (
                                                                            <SelectItem key={unit.id} value={unit.id} className="text-xs">
                                                                                {unit.abbreviation}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage className="text-[10px]" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {materialsList.length === 0 && (
                                    <div className="text-center py-8 text-xs text-muted-foreground">
                                        Click "Add" to add materials
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 3: Review */}
                        {currentStep === (isAdminOrOwner ? 3 : 2) && (
                            <div className="space-y-4 animate-in fade-in-50 duration-300">
                                <div className="rounded-lg border p-4 space-y-3">
                                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                                        Review Your Indent Request
                                    </h3>

                                    <div className="space-y-2">
                                        <div className="flex justify-between py-2 border-b">
                                            <span className="text-sm text-muted-foreground">Indent Name:</span>
                                            <span className="text-sm font-medium">{form.getValues("name")}</span>
                                        </div>

                                        <div className="flex justify-between py-2 border-b">
                                            <span className="text-sm text-muted-foreground">Project:</span>
                                            <span className="text-sm font-medium">
                                                {projects.find((p) => p.id === form.getValues("projectId"))?.name || "N/A"}
                                            </span>
                                        </div>

                                        {form.getValues("taskId") && (
                                            <div className="flex justify-between py-2 border-b">
                                                <span className="text-sm text-muted-foreground">Task:</span>
                                                <span className="text-sm font-medium">
                                                    {tasks.find((t) => t.id === form.getValues("taskId"))?.name || "N/A"}
                                                </span>
                                            </div>
                                        )}

                                        {/* <div className="flex justify-between py-2 border-b">
                                            <span className="text-sm text-muted-foreground">Quantity:</span>
                                            <span className="text-sm font-medium">{form.getValues("quantity")}</span>
                                        </div> */}

                                        {form.getValues("expectedDelivery") && (
                                            <div className="flex justify-between py-2 border-b">
                                                <span className="text-sm text-muted-foreground">Expected Delivery:</span>
                                                <span className="text-sm font-medium">
                                                    {format(form.getValues("expectedDelivery")!, "PPP")}
                                                </span>
                                            </div>
                                        )}

                                        {form.getValues("description") && (
                                            <div className="py-2 border-b">
                                                <span className="text-sm text-muted-foreground block mb-1">Description:</span>
                                                <p className="text-sm">{form.getValues("description")}</p>
                                            </div>
                                        )}

                                        {isAdminOrOwner && materialsList.length > 0 && materialsList[0].materialId && (
                                            <div className="py-2">
                                                <span className="text-sm text-muted-foreground block mb-2">Materials:</span>
                                                <div className="space-y-2">
                                                    {materialsList.map((item, index) => (
                                                        <div key={index} className="bg-muted/50 rounded p-2 text-sm">
                                                            <div className="flex justify-between items-start gap-2">
                                                                <div>
                                                                    <div className="font-medium">
                                                                        {materials.find((m) => m.id === item.materialId)?.name || "Unknown"}
                                                                    </div>
                                                                    <div className="text-muted-foreground text-xs">
                                                                        Quantity: {item.quantity} {units.find((u) => u.id === item.unitId)?.abbreviation || ""}
                                                                    </div>
                                                                    {item.vendorId && (
                                                                        <div className="text-muted-foreground text-xs mt-1">
                                                                            Preferred Vendor: <span className="text-foreground">{vendors?.find(v => v.id === item.vendorId)?.name || "Unknown"}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {item.estimatedPrice && (
                                                                    <div className="text-right">
                                                                        <div className="text-xs font-medium">
                                                                            Est. {item.estimatedPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-muted/50 rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground">
                                        {isAdminOrOwner
                                            ? "Once submitted, this indent request will be created with the selected materials."
                                            : "Once submitted, your indent request will be sent for admin review. You'll be notified when a decision is made."
                                        }
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex justify-between pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleBack}
                                disabled={currentStep === 1 || pending}
                            >
                                <IconArrowLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleOpenChange(false)}
                                    disabled={pending}
                                >
                                    Cancel
                                </Button>

                                {currentStep < totalSteps ? (
                                    <Button type="button" onClick={handleNext}>
                                        Next
                                        <IconArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                ) : (
                                    <Button type="submit" disabled={pending}>
                                        {pending ? (
                                            <>
                                                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Submitting...
                                            </>
                                        ) : (
                                            <>
                                                <IconCheck className="mr-2 h-4 w-4" />
                                                Submit Request
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
