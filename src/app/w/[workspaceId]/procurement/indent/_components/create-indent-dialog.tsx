"use client";

import React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition, useEffect } from "react";
import { editIndent } from "@/actions/procurement/edit-indent";
import { createIndentRequest } from "@/actions/procurement/create-indent";
import { WorkspaceMemberRow } from "@/data/workspace/get-workspace-members";
import { WorkspaceRole } from "@/generated/prisma/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { indentDialogSchema, type IndentDialogFormData, type MaterialItemType } from "@/lib/zodSchemas";
import { IconPlus, IconLoader2, IconArrowLeft, IconArrowRight, IconCheck, IconX } from "@tabler/icons-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface CreateIndentDialogProps {
    workspaceId: string;
    projects: { id: string; name: string }[];
    tasks?: { id: string; name: string; projectId: string; assigneeId?: string | null }[];
    materials?: { id: string; name: string; defaultUnitId: string | null; vendors?: { id: string; name: string }[] }[]; // Updated slightly to allow null
    units?: { id: string; name: string; abbreviation: string | null }[]; // Updated slightly to allow null
    vendors?: { id: string; name: string }[];
    trigger?: React.ReactNode;
    userRole?: WorkspaceRole;
    defaultProjectId?: string;
    defaultTaskId?: string;
    workspaceMembers: WorkspaceMemberRow[];
    currentMemberId: string;
    mode?: "create" | "edit";
    initialData?: IndentDialogFormData;
    indentId?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function CreateIndentDialog({
    workspaceId,
    projects,
    tasks = [],
    materials = [],
    units = [],
    vendors = [],
    trigger,
    userRole = "MEMBER" as WorkspaceRole,
    defaultProjectId,
    defaultTaskId,
    workspaceMembers,
    currentMemberId,
    mode = "create",
    initialData,
    indentId,
    open: externalOpen,
    onOpenChange: externalOnOpenChange,
}: CreateIndentDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
    const onOpenChange = externalOnOpenChange || setInternalOpen;

    const [currentStep, setCurrentStep] = useState(1);
    const [pending, startTransition] = useTransition();

    const isAdminOrOwner = userRole === "OWNER" || userRole === "ADMIN";
    const totalSteps = 3; // Info -> Materials -> Preview

    const form = useForm<IndentDialogFormData>({
        resolver: zodResolver(indentDialogSchema),
        defaultValues: initialData || {
            name: "",
            projectId: defaultProjectId || "",
            taskId: defaultTaskId,
            description: "",
            expectedDelivery: undefined,
            materials: [{ materialId: "", quantity: 1, unitId: undefined, vendorId: undefined, estimatedPrice: undefined }],
            requiresVendor: true,
            assignedTo: "",
        },
        mode: "onChange",
    });

    useEffect(() => {
        if (isOpen && mode === "edit" && initialData) {
            // Ensure dates are Dates and reset form
            const data = { ...initialData };
            if (typeof data.expectedDelivery === 'string') {
                data.expectedDelivery = new Date(data.expectedDelivery);
            }
            // Force reset to populate fields
            form.reset(data);
        } else if (isOpen && mode === "create") {
            // Optional: reset for create mode if needed
            // form.reset(defaultValues); 
            setCurrentStep(1);
        }
    }, [isOpen, initialData, mode, form]);

    // Watch for task changes to enforce assignee
    const selectedTaskId = form.watch("taskId");
    useEffect(() => {
        if (selectedTaskId) {
            const task = tasks.find(t => t.id === selectedTaskId);
            if (task?.assigneeId) {
                form.setValue("assignedTo", task.assigneeId);
            }
        }
    }, [selectedTaskId, tasks, form]);



    // Initialize defaults for CREATE mode
    useEffect(() => {
        if (isOpen && mode === "create") {
            // Check if defaultTaskId has an assignee
            let initialAssignee = "";
            if (defaultTaskId) {
                const task = tasks.find(t => t.id === defaultTaskId);
                if (task?.assigneeId) {
                    initialAssignee = task.assigneeId;
                }
            }

            form.reset({
                name: "",
                projectId: defaultProjectId || "",
                taskId: defaultTaskId,
                description: "",
                expectedDelivery: undefined,
                materials: [{ materialId: "", quantity: 1, unitId: undefined, vendorId: undefined, estimatedPrice: undefined }],
                requiresVendor: true,
                assignedTo: initialAssignee,
            });
        }
    }, [isOpen, mode, defaultProjectId, defaultTaskId, form, tasks]);

    const selectedProjectId = form.watch("projectId");
    const filteredTasks = tasks.filter((task) => task.projectId === selectedProjectId);
    const materialsList = form.watch("materials") || [];
    const requiresVendor = form.watch("requiresVendor");

    const addMaterial = () => {
        const current = form.getValues("materials") || [];
        form.setValue("materials", [...current, { materialId: "", quantity: 1, unitId: undefined, vendorId: undefined, estimatedPrice: undefined, itemStatus: "PENDING", documentDisplayName: "" }]);
    };

    const removeMaterial = (index: number) => {
        const current = form.getValues("materials") || [];
        if (current.length > 1) {
            form.setValue("materials", current.filter((_: MaterialItemType, i: number) => i !== index));
        }
    };

    const validateStep = async (step: number): Promise<boolean> => {
        let fields: (keyof IndentDialogFormData)[] = [];

        switch (step) {
            case 1:
                // Check if task has assignee (locked state)
                const selectedTaskId = form.getValues("taskId");
                const selectedTask = tasks.find(t => t.id === selectedTaskId);
                const isAssigneeLocked = !!(selectedTask?.assigneeId);

                // Only validate assignedTo if it's not locked
                if (isAssigneeLocked) {
                    fields = ["name", "projectId", "requiresVendor"];
                } else {
                    fields = ["name", "projectId", "requiresVendor", "assignedTo"];
                }
                break;
            case 2:
                // All users can now provide materials, so validate materials for everyone
                fields = ["materials"];
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
            // No more skipping step 2 based on role
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = (e?: React.MouseEvent) => {
        e?.preventDefault();
        if (currentStep > 1) {
            // No more skipping step 2 based on role
            setCurrentStep(currentStep - 1);
        }
    };

    const onSubmit = (data: IndentDialogFormData) => {
        startTransition(async () => {
            try {
                let result;
                if (mode === "edit" && indentId) {
                    result = await editIndent({
                        indentId,
                        workspaceId,
                        ...data,
                        materials: data.materials?.map(m => ({
                            ...m,
                            estimatedPrice: m.estimatedPrice ?? undefined,
                            vendorId: m.vendorId ?? undefined
                        }))
                    });
                } else {
                    result = await createIndentRequest({
                        workspaceId,
                        ...data,
                        // Allow all users to provide materials
                        materials: data.materials?.map(m => ({
                            ...m,
                            estimatedPrice: m.estimatedPrice ?? undefined,
                            vendorId: m.vendorId ?? undefined
                        })),
                        requiresVendor: data.requiresVendor ?? true,
                    });
                }

                if (result.success) {
                    toast.success(mode === "edit" ? "Indent updated successfully!" : "Indent request created successfully!");
                    onOpenChange(false);
                    if (mode === "create") form.reset();
                    setCurrentStep(1);
                } else {
                    toast.error(result.error || (mode === "edit" ? "Failed to update indent" : "Failed to create indent request"));
                }
            } catch (error) {
                toast.error("Something went wrong");
            }
        });
    };

    const handleOpenChange = (newOpen: boolean) => {
        onOpenChange(newOpen);
        if (!newOpen) {
            setTimeout(() => {
                if (mode === "create") {
                    form.reset();
                }
                setCurrentStep(1);
            }, 200);
        }
    };

    function ExpectedDeliveryField({
        field,
    }: {
        field: any;
    }) {
        const [open, setOpen] = React.useState(false);

        return (
            <FormItem className="flex flex-col">
                <FormLabel>
                    Expected Delivery <span className="text-red-500">*</span>
                </FormLabel>

                <Popover open={open} onOpenChange={setOpen}>
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
                                    {field.value ? format(field.value, "PPP") : "Pick a date *"}
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
                                setOpen(false);
                            }}
                            disabled={(date) => date < new Date()}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>

                <FormMessage />
            </FormItem>
        );
    }

    function AssignedToField({
        field,
        form,
        tasks,
        workspaceMembers,
        mode,
    }: {
        field: any;
        form: any;
        tasks: any[];
        workspaceMembers: any[];
        mode: string;
    }) {
        const selectedTask = tasks.find(t => t.id === form.getValues("taskId"));
        const isLocked = !!selectedTask?.assigneeId;
        const selectedMember = workspaceMembers.find(m => m.id === field.value);

        React.useEffect(() => {
            if (isLocked && field.value) {
                form.clearErrors("assignedTo");
            }
        }, [isLocked, field.value, form]);

        return (
            <FormItem>
                <FormLabel>
                    Assign To <span className="text-red-500">*</span>
                </FormLabel>

                <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLocked || mode === "edit"}
                >
                    <FormControl>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select assignee">
                                {selectedMember
                                    ? `${selectedMember.user?.name ?? ""} ${selectedMember.user?.surname ?? ""}`.trim()
                                    : "Select assignee"}
                            </SelectValue>
                        </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                        {workspaceMembers.map(member => (
                            <SelectItem key={member.id} value={member.id}>
                                {member.user?.name} {member.user?.surname}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <FormMessage />

                {isLocked && (
                    <FormDescription>
                        Assignee is locked to the task assignee.
                    </FormDescription>
                )}
            </FormItem>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="min-w-[90vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
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
                                                    disabled={mode === "edit"}
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
                                                    disabled={!!defaultProjectId || mode === "edit"}
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
                                                    disabled={!!defaultTaskId || !selectedProjectId || (mode === "edit" && !!initialData?.taskId)}
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
                                        render={({ field }) => <ExpectedDeliveryField field={field} />}
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
                                                    placeholder="Add any additional details or context..."
                                                    className="resize-none min-h-[80px]"
                                                    {...field}
                                                    disabled={mode === "edit"}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="requiresVendor"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 text-muted-foreground">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                    disabled={mode === "edit"}
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel>
                                                    I also need to specify a vendor
                                                </FormLabel>
                                                <FormDescription>
                                                    Uncheck if you only want to request the material without a vendor preference.
                                                </FormDescription>
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="assignedTo"
                                    render={({ field }) => (
                                        <AssignedToField
                                            field={field}
                                            form={form}
                                            tasks={tasks}
                                            workspaceMembers={workspaceMembers}
                                            mode={mode}
                                        />
                                    )}
                                />
                            </div>
                        )}

                        {/* Step 2: Material Selection */}
                        {currentStep === 2 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
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

                                {/* Header Row */}
                                <div className={cn(requiresVendor
                                    ? "grid grid-cols-[2fr_2fr_2fr_1fr_0.7fr_0.7fr_30px] gap-2"
                                    : "grid grid-cols-[3fr_3fr_1fr_1fr_30px] gap-2",
                                    "px-2 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                                )}>
                                    <div>Material</div>
                                    <div>Printed on PO & Invoice</div>
                                    {requiresVendor && (
                                        <>
                                            <div>Preferred Vendor</div>
                                            <div className="text-right">Est. Price</div>
                                        </>
                                    )}
                                    <div>Qty</div>
                                    <div>Unit</div>
                                    <div></div>
                                </div>

                                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                    {materialsList.map((itemValue: MaterialItemType, index: number) => {
                                        const isApproved = itemValue.itemStatus === "APPROVED" && mode === "edit";

                                        const gridCols = requiresVendor
                                            ? "grid grid-cols-[2fr_2fr_2fr_1fr_0.7fr_0.7fr_30px] gap-2"
                                            : "grid grid-cols-[3fr_3fr_1fr_1fr_30px] gap-2";

                                        return (
                                            <div key={index} className={`relative bg-muted/30 hover:bg-muted/50 border rounded-md p-2 transition-colors ${isApproved ? 'opacity-80' : ''}`}>
                                                {materialsList.length > 1 && !isApproved && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="absolute -top-1 -right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background border shadow-sm z-10"
                                                        onClick={() => removeMaterial(index)}
                                                    >
                                                        <IconX className="h-3 w-3" />
                                                    </Button>
                                                )}

                                                <div className={`${gridCols} items-start`}>
                                                    <div className="w-full">
                                                        <FormField
                                                            control={form.control}
                                                            name={`materials.${index}.materialId`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <Select
                                                                        onValueChange={(value) => {
                                                                            field.onChange(value);
                                                                            // Reset status on material change
                                                                            form.setValue(`materials.${index}.itemStatus`, "PENDING" as any);

                                                                            // Find selected material and auto-select its default unit
                                                                            const selectedMaterial = materials.find(m => m.id === value);
                                                                            if (selectedMaterial?.defaultUnitId) {
                                                                                form.setValue(`materials.${index}.unitId`, selectedMaterial.defaultUnitId);
                                                                            }

                                                                            // Reset vendor and price when material changes
                                                                            form.setValue(`materials.${index}.vendorId`, "");
                                                                            form.setValue(`materials.${index}.estimatedPrice`, undefined);
                                                                        }}
                                                                        disabled={isApproved}
                                                                        value={field.value}
                                                                    >
                                                                        <FormControl>
                                                                            <SelectTrigger className="h-9 text-xs w-full overflow-hidden">
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

                                                    <div className="w-full">
                                                        <FormField
                                                            control={form.control}
                                                            name={`materials.${index}.documentDisplayName`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormControl>
                                                                        <Input
                                                                            placeholder="Desc/Remark"
                                                                            className="h-9 text-xs w-full"
                                                                            {...field}
                                                                            value={field.value || ""}
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage className="text-[10px]" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>

                                                    {requiresVendor && (
                                                        <>
                                                            <div className="w-full">
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

                                                                        return (
                                                                            <FormItem>
                                                                                <Select
                                                                                    onValueChange={(value) => {
                                                                                        field.onChange(value);
                                                                                        form.setValue(`materials.${index}.itemStatus`, "PENDING" as any);
                                                                                    }}
                                                                                    value={field.value || undefined}
                                                                                    disabled={(!selectedMaterialId) || isApproved}
                                                                                >
                                                                                    <FormControl>
                                                                                        <SelectTrigger className="h-9 text-xs w-full overflow-hidden">
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

                                                            <div className="w-full">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`materials.${index}.estimatedPrice`}
                                                                    render={({ field }) => {
                                                                        const currentVendorId = materialsList[index]?.vendorId;
                                                                        const hasVendor = currentVendorId && currentVendorId.trim() !== "";

                                                                        return (
                                                                            <FormItem>
                                                                                <FormControl>
                                                                                    <Input
                                                                                        type="number"
                                                                                        step="0.5"
                                                                                        min="1"
                                                                                        placeholder="Price/Pc"
                                                                                        className="h-9 text-xs text-right w-full"
                                                                                        value={field.value || ""}
                                                                                        onChange={(e) => {
                                                                                            field.onChange(e.target.value ? parseFloat(e.target.value) : undefined);
                                                                                            form.setValue(`materials.${index}.itemStatus`, "PENDING" as any);
                                                                                        }}
                                                                                        disabled={(!hasVendor) || isApproved}
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

                                                    <div className="w-full">
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
                                                                            disabled={isApproved}
                                                                            {...field}
                                                                            onChange={(e) => {
                                                                                field.onChange(parseFloat(e.target.value) || 0);
                                                                                form.setValue(`materials.${index}.itemStatus`, "PENDING" as any);
                                                                            }}
                                                                            className="h-9 text-xs w-full"
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage className="text-[10px]" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>

                                                    <div className="w-full">
                                                        <FormField
                                                            control={form.control}
                                                            name={`materials.${index}.unitId`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <Select
                                                                        onValueChange={(value) => {
                                                                            field.onChange(value);
                                                                            form.setValue(`materials.${index}.itemStatus`, "PENDING" as any);
                                                                        }}
                                                                        value={field.value}
                                                                        disabled={isApproved}
                                                                    >
                                                                        <FormControl>
                                                                            <SelectTrigger className="h-9 text-xs w-full">
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

                                                    {/* Item Status/Approval (Visible to all in Edit, Editable by Admin) */}
                                                    {mode === "edit" && (
                                                        <FormField
                                                            control={form.control}
                                                            name={`materials.${index}.itemStatus`}
                                                            render={({ field }) => {
                                                                const status = field.value || "";
                                                                const isAlreadyApproved = ["APPROVED", "QUANTITY_APPROVED", "VENDOR_PENDING"].includes(status);

                                                                // Check if vendor details are filled (if required)
                                                                const hasVendorDetails = !requiresVendor || (itemValue.vendorId && itemValue.estimatedPrice !== undefined && itemValue.estimatedPrice !== null);

                                                                if (isAlreadyApproved) {
                                                                    return (
                                                                        <div className="flex items-center justify-center h-8 px-2 text-green-600 font-medium text-[10px] border border-green-200 bg-green-50 rounded">
                                                                            Approved
                                                                        </div>
                                                                    );
                                                                }

                                                                // Only allow Admins to approve pending items, and only if vendor details are present
                                                                if (isAdminOrOwner && hasVendorDetails) {
                                                                    return (
                                                                        <FormItem className="flex items-center justify-center h-8">
                                                                            <FormControl>
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100 rounded-full"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        field.onChange("APPROVED");
                                                                                    }}
                                                                                    title="Approve"
                                                                                >
                                                                                    <IconCheck className="h-5 w-5" />
                                                                                </Button>
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    );
                                                                }

                                                                return <div className="w-8 h-8" />; // Spacer for alignment if needed
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {materialsList.length === 0 && (
                                    <div className="text-center py-8 text-xs text-muted-foreground">
                                        Click "Add" to add materials
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 3: Review */}
                        {currentStep === 3 && (
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

                                        <div className="flex justify-between py-2 border-b">
                                            <span className="text-sm text-muted-foreground">Assignee:</span>
                                            <span className="text-sm font-medium">
                                                {workspaceMembers?.find(m => m.id === form.getValues("assignedTo"))?.user?.name || "Unknown"}
                                            </span>
                                        </div>

                                        {isAdminOrOwner && materialsList.length > 0 && materialsList[0].materialId && (
                                            <div className="py-2">
                                                <span className="text-sm text-muted-foreground block mb-2">Materials:</span>
                                                <div className="space-y-2">
                                                    {materialsList.map((item: MaterialItemType, index: number) => (
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
                                                {mode === "edit" ? "Update Indent" : "Submit Request"}
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </form>
                </Form >
            </DialogContent >
        </Dialog >
    );
}
