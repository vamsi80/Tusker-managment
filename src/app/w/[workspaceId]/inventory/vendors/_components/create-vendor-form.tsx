"use client";

import { useState, useTransition } from "react";
import { Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vendorSchema, VendorSchemaType } from "@/lib/zodSchemas";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { IconPlus, IconLoader2, IconCheck, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { tryCatch } from "@/hooks/try-catch";
import { createVendor } from "@/actions/inventory/vendors";

interface CreateVendorFormProps {
    workspaceId: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
    hideTrigger?: boolean;
    materials?: { id: string; name: string }[];
}

export function CreateVendorForm({ workspaceId, open: controlledOpen, onOpenChange: controlledOnOpenChange, trigger, hideTrigger, materials = [] }: CreateVendorFormProps) {
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

    const form = useForm<VendorSchemaType>({
        resolver: zodResolver(vendorSchema) as unknown as Resolver<VendorSchemaType>,
        defaultValues: {
            name: "",
            companyName: "",
            contactPerson: "",
            contactNumber: "",
            email: "",
            address: "",
            gstNumber: "",
            workspaceId: workspaceId,
            isActive: true,
        },
    });

    function onSubmit(data: VendorSchemaType) {
        // Log data to console as requested
        console.log("Submitting Vendor Data:", data);

        startTransition(async () => {
            const { data: result, error } = await tryCatch(createVendor(data));

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                form.reset();
                setOpen(false);
            } else {
                toast.error(result.message);
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {!hideTrigger && (
                <DialogTrigger asChild>
                    {trigger || (
                        <Button variant="outline" className="text-primary border-primary/50 bg-primary/5 hover:bg-primary/10">
                            <IconPlus className="mr-2 h-4 w-4" />
                            Add Vendor
                        </Button>
                    )}
                </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add New Vendor</DialogTitle>
                    <DialogDescription>
                        Add a new vendor or supplier to your workspace.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vendor Name *</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., ABC Supplies" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="companyName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Company Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Tusker Pvt Ltd" {...field} value={field.value || ""} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="contactPerson"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Contact Person</FormLabel>
                                        <FormControl>
                                            <Input placeholder="John Doe" {...field} value={field.value || ""} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="contactNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Contact Number</FormLabel>
                                        <FormControl>
                                            <Input placeholder="+91..." {...field} value={field.value || ""} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input placeholder="vendor@example.com" type="email" {...field} value={field.value || ""} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="gstNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>GST Number</FormLabel>
                                    <FormControl>
                                        <Input placeholder="GST..." {...field} value={field.value || ""} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Address</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Full address..." {...field} value={field.value || ""} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}

                        />

                        <FormField
                            control={form.control}
                            name="materialIds"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Supplies Material</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className={cn(
                                                        "w-full justify-between h-auto min-h-10 px-3 py-2 text-left font-normal",
                                                        !field.value || field.value.length === 0 ? "text-muted-foreground" : ""
                                                    )}
                                                >
                                                    <div className="flex flex-wrap gap-1">
                                                        {field.value && field.value.length > 0 ? (
                                                            field.value.map((val) => {
                                                                const material = materials.find((m) => m.id === val);
                                                                return material ? (
                                                                    <Badge key={val} variant="secondary" className="mr-1 mb-1">
                                                                        {material.name}
                                                                        <span
                                                                            role="button"
                                                                            className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                                                                            onMouseDown={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                            }}
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                const newValue = field.value?.filter((v) => v !== val);
                                                                                field.onChange(newValue);
                                                                            }}
                                                                        >
                                                                            <IconX className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                                                        </span>
                                                                    </Badge>
                                                                ) : null;
                                                            })
                                                        ) : (
                                                            <span>Select materials...</span>
                                                        )}
                                                    </div>
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[450px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search materials..." />
                                                <CommandList>
                                                    <CommandEmpty>No material found.</CommandEmpty>
                                                    <CommandGroup className="max-h-64 overflow-auto">
                                                        {materials.map((material) => (
                                                            <CommandItem
                                                                key={material.id}
                                                                value={material.name}
                                                                onSelect={() => {
                                                                    const current = field.value || [];
                                                                    const isSelected = current.includes(material.id);
                                                                    if (isSelected) {
                                                                        field.onChange(current.filter((v) => v !== material.id));
                                                                    } else {
                                                                        field.onChange([...current, material.id]);
                                                                    }
                                                                }}
                                                            >
                                                                <div className={cn(
                                                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                                    field.value?.includes(material.id)
                                                                        ? "bg-primary text-primary-foreground"
                                                                        : "opacity-50 [&_svg]:invisible"
                                                                )}>
                                                                    <IconCheck className={cn("h-4 w-4")} />
                                                                </div>
                                                                <span>{material.name}</span>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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
                                        Create Vendor
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
