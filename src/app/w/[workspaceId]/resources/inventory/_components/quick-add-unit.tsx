"use client";

import { useTransition } from "react";
import { Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { unitSchema, UnitSchemaType, unitCategories } from "@/lib/zodSchemas";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconLoader2, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { tryCatch } from "@/hooks/try-catch";
import { createUnit } from "@/actions/inventory/units";

interface QuickAddUnitProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUnitCreated: (unit: { id: string; name: string; abbreviation: string; category: string }) => void;
    workspaceId: string;
}

export function QuickAddUnit({ open, onOpenChange, onUnitCreated, workspaceId }: QuickAddUnitProps) {
    const [pending, startTransition] = useTransition();

    const form = useForm<UnitSchemaType>({
        resolver: zodResolver(unitSchema) as unknown as Resolver<UnitSchemaType>,
        defaultValues: {
            name: "",
            abbreviation: "",
            category: undefined,
        },
    });

    function onSubmit(data: UnitSchemaType) {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(createUnit(data, workspaceId));

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success" && result.data) {
                toast.success(result.message);
                onUnitCreated({
                    id: result.data.id,
                    name: result.data.name,
                    abbreviation: result.data.abbreviation,
                    category: result.data.category || "Other",
                });
                form.reset();
                onOpenChange(false);
            } else {
                toast.error(result.message);
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Quick Add Unit</DialogTitle>
                    <DialogDescription>
                        Add a new unit of measurement quickly.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* Unit Name */}
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Unit Name *</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="e.g., Kilogram, Meter, Piece"
                                            {...field}
                                            autoFocus
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Abbreviation */}
                        <FormField
                            control={form.control}
                            name="abbreviation"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Abbreviation *</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="e.g., kg, m, pcs"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Category */}
                        <FormField
                            control={form.control}
                            name="category"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Category *</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a category" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {unitCategories.map((category) => (
                                                <SelectItem key={category} value={category}>
                                                    {category}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        The unit will appear under this category
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Form Actions */}
                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
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
                                        Add Unit
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
