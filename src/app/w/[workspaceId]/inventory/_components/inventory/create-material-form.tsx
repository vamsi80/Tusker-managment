"use client";

import { useState, useTransition } from "react";
import { Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { materialSchema, MaterialSchemaType } from "@/lib/zodSchemas";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { IconPlus, IconLoader2, IconEdit, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { tryCatch } from "@/hooks/try-catch";
import { createMaterial } from "@/actions/inventory/materials";
import { deleteUnit } from "@/actions/inventory/units";
import { QuickAddUnit } from "./quick-add-unit";


interface CreateMaterialFormProps {
    workspaceId: string;
    units: {
        id: string;
        name: string;
        abbreviation: string;
        category: string | null;
        isDefault: boolean;
    }[];
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    hideTrigger?: boolean;
    onAddOptimistic?: (material: any) => void;
}

export function CreateMaterialForm({ workspaceId, units: initialUnits, open: controlledOpen, onOpenChange: controlledOnOpenChange, hideTrigger, onAddOptimistic }: CreateMaterialFormProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = (newOpen: boolean) => {
        if (isControlled) {
            controlledOnOpenChange?.(newOpen);
        } else {
            setInternalOpen(newOpen);
        }
    };
    const [pending, startTransition] = useTransition();
    const [quickAddUnitOpen, setQuickAddUnitOpen] = useState(false);
    const [units, setUnits] = useState(initialUnits);

    const form = useForm<MaterialSchemaType>({
        resolver: zodResolver(materialSchema) as unknown as Resolver<MaterialSchemaType>,
        defaultValues: {
            name: "",
            specifications: "",
            defaultUnitId: "",
            workspaceId: workspaceId,
            isActive: true,
        },
    });

    function onSubmit(data: MaterialSchemaType) {
        setOpen(false); // Close dialog immediately

        // Optimistic update
        if (onAddOptimistic) {
            const selectedUnit = units.find(u => u.id === data.defaultUnitId);
            const optimisticMaterial = {
                id: "optimistic-" + Math.random().toString(),
                name: data.name,
                specifications: data.specifications || null,
                defaultUnitId: data.defaultUnitId,
                workspaceId: data.workspaceId,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                defaultUnit: selectedUnit ? {
                    id: selectedUnit.id,
                    name: selectedUnit.name,
                    abbreviation: selectedUnit.abbreviation,
                    isDefault: selectedUnit.isDefault,
                    category: selectedUnit.category || null,
                    workspaceId: workspaceId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: null,
                    workspaceMemberId: null,
                    isActive: true
                } : {
                    id: "unknown",
                    name: "Unknown",
                    abbreviation: "?",
                    isDefault: false,
                    category: null,
                    workspaceId: workspaceId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: null,
                    workspaceMemberId: null,
                    isActive: true
                }
            };
            onAddOptimistic(optimisticMaterial);
        }

        startTransition(async () => {
            const { data: result, error } = await tryCatch(createMaterial(data));

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                form.reset();
                // setOpen(false); // Already closed optimistically
            } else {
                toast.error(result.message);
            }
        });
    }

    const handleUnitCreated = (newUnit: { id: string; name: string; abbreviation: string; category: string }) => {
        // Add the new unit to the list with its selected category
        const unitWithCategory = {
            ...newUnit,
            category: newUnit.category,
            isDefault: false, // User-created units are never default
        };
        setUnits([...units, unitWithCategory]);

        // Automatically select the newly created unit
        form.setValue("defaultUnitId", newUnit.id);
    };

    const handleEditUnit = (unitId: string) => {
        // TODO: Open edit dialog
        toast.info("Edit unit feature coming soon!");
        console.log("Edit unit:", unitId);
    };

    const handleDeleteUnit = (unitId: string) => {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(deleteUnit(unitId, workspaceId));

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success") {
                // Remove unit from local state
                setUnits(units.filter(u => u.id !== unitId));
                toast.success(result.message);
            } else {
                toast.error(result.message);
            }
        });
    };

    // Group units by category
    const groupedUnits = units.reduce((acc, unit) => {
        const category = unit.category || "General";
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(unit);
        return acc;
    }, {} as Record<string, typeof units>);

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                {!hideTrigger && (
                    <DialogTrigger asChild>
                        <Button>
                            <IconPlus className="mr-2 h-4 w-4" />
                            Add Material
                        </Button>
                    </DialogTrigger>
                )}
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Add New Material</DialogTitle>
                        <DialogDescription>
                            Create a new material for your inventory. All fields marked with * are required.
                        </DialogDescription>
                    </DialogHeader>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            {/* Material Name */}
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Material Name *</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="e.g., Portland Cement, Steel Rebar"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Default Unit with Quick Add */}
                            <FormField
                                control={form.control}
                                name="defaultUnitId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Default Unit *</FormLabel>
                                        <div className="flex gap-2">
                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="flex-1">
                                                        <SelectValue placeholder="Select a unit" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {Object.entries(groupedUnits).map(([category, categoryUnits]) => (
                                                        <div key={category}>
                                                            <div className="px-2 py-1.5 text-sm font-semibold text-foreground bg-muted sticky top-0 z-10 border-b">
                                                                {category}
                                                            </div>
                                                            {categoryUnits.map((unit) => (
                                                                <div key={unit.id} className={`relative ${!unit.isDefault ? 'group' : ''}`}>
                                                                    <SelectItem value={unit.id} className={!unit.isDefault ? "pr-20" : ""}>
                                                                        {unit.name} ({unit.abbreviation})
                                                                    </SelectItem>
                                                                    {!unit.isDefault && (
                                                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-6 w-6"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleEditUnit(unit.id);
                                                                                }}
                                                                                title="Edit unit"
                                                                            >
                                                                                <IconEdit className="h-3 w-3" />
                                                                            </Button>
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteUnit(unit.id);
                                                                                }}
                                                                                title="Delete unit"
                                                                            >
                                                                                <IconTrash className="h-3 w-3" />
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setQuickAddUnitOpen(true)}
                                                title="Add new unit"
                                            >
                                                <IconPlus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <FormDescription>
                                            The default unit of measurement for this material
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Specifications */}
                            <FormField
                                control={form.control}
                                name="specifications"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Specifications</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="e.g., Grade 43, OPC, 50kg bags"
                                                className="resize-none"
                                                rows={3}
                                                {...field}
                                                value={field.value || ""}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Optional technical specifications or notes
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Form Actions */}
                            <div className="flex justify-end gap-3 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setOpen(false)}
                                    disabled={pending}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={pending}>
                                    {pending ? (
                                        <>
                                            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <IconPlus className="mr-2 h-4 w-4" />
                                            Create Material
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Quick Add Unit Dialog */}
            <QuickAddUnit
                open={quickAddUnitOpen}
                onOpenChange={setQuickAddUnitOpen}
                onUnitCreated={handleUnitCreated}
                workspaceId={workspaceId}
            />
        </>
    );
}
