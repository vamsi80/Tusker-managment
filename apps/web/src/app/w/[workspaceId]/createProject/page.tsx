"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { projectsClient } from "@/lib/api-client/projects";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, Resolver } from "react-hook-form";
import { tryCatch } from "@/lib/try-catch";
import { toast } from "sonner";
import { useConfetti } from "@/hooks/use-confetti";
import slugify from "slugify";
import { getColorFromString, generateRandomColor } from "@/lib/colors/project-colors";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";
import {
    Check,
    ChevronLeft,
    Loader2,
    Plus,
    Users,
    Briefcase,
    Info,
} from "lucide-react";
import { cn, toTitleCase } from "@/lib/utils";
import { type WorkspaceMembersResult } from "@/types/workspace";
import Link from "next/link";

export default function CreateProjectPage() {
    const { workspaceId, data: layoutData, isLoading: isLayoutLoading } = useWorkspaceLayout();
    const { permissions } = layoutData;
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();

    const [members, setMembers] = useState<WorkspaceMembersResult["workspaceMembers"]>([]);
    const [existingClients, setExistingClients] = useState<any[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(true);
    const [isLoadingClients, setIsLoadingClients] = useState(true);

    // --- Access Control ---
    const isManager = permissions?.workspaceRole === "MANAGER";
    const isAdminOrOwner = permissions?.workspaceRole === "ADMIN" || permissions?.workspaceRole === "OWNER";
    const canAccess = isManager || isAdminOrOwner || permissions?.canCreateProject;

    useEffect(() => {
        // Only redirect if layout and members have finished loading AND user is explicitly not authorized
        if (!isLayoutLoading && !isLoadingMembers && !canAccess) {
            toast.error("You do not have permission to create projects in this workspace.");
            router.push(`/w/${workspaceId}`);
        }
    }, [isLayoutLoading, isLoadingMembers, canAccess, workspaceId, router]);

    useEffect(() => {
        async function loadMembers() {
            try {
                const result = await projectsClient.getWorkspaceMembers(workspaceId);
                if (result) {
                    setMembers(result as any);
                }
            } catch (error) {
                console.error("Failed to load members:", error);
                toast.error("Failed to load workspace members");
            } finally {
                setIsLoadingMembers(false);
            }
        }
        loadMembers();
    }, [workspaceId]);

    useEffect(() => {
        async function loadClients() {
            try {
                const result = await projectsClient.getWorkspaceClients(workspaceId);
                if (result) {
                    // De-duplicate by name and registered company name to avoid duplicates in the list
                    const uniqueClients = result.reduce((acc: any[], curr: any) => {
                        const exists = acc.find(c =>
                            (c.name === curr.name && c.registeredCompanyName === curr.registeredCompanyName) ||
                            (curr.gstNumber && c.gstNumber === curr.gstNumber)
                        );
                        if (!exists) acc.push(curr);
                        return acc;
                    }, []);
                    setExistingClients(uniqueClients);
                }
            } catch (error) {
                console.error("Failed to load clients:", error);
            } finally {
                setIsLoadingClients(false);
            }
        }
        loadClients();
    }, [workspaceId]);

    const form = useForm<ProjectSchemaType>({
        resolver: zodResolver(projectSchema as any),
        defaultValues: {
            name: "",
            description: "",
            slug: "",
            color: generateRandomColor(),
            workspaceId: workspaceId,
            projectManagerId: "",
            memberAccess: [],
            isInternal: false,
            companyName: "",
            registeredCompanyName: "",
            directorName: "",
            address: "",
            gstNumber: "",
            contactPerson: "",
            phoneNumber: "",
            tagIds: [],
        },
    });

    // Auto-assign manager if current user is MANAGER
    useEffect(() => {
        if (isManager && members.length > 0 && !form.getValues("projectManagerId")) {
            const currentMember = members.find(m => m.userId === permissions?.userId);
            if (currentMember) {
                form.setValue("projectManagerId", currentMember.id);
            }
        }
    }, [isManager, members, permissions?.userId, form]);

    const watchedName = useWatch({ control: form.control, name: "name" });
    const watchedColor = useWatch({ control: form.control, name: "color" });
    const watchedSlug = useWatch({ control: form.control, name: "slug" });
    const watchedPMId = useWatch({ control: form.control, name: "projectManagerId" });

    useEffect(() => {
        if (watchedName) {
            const autoColor = getColorFromString(watchedName);
            form.setValue("color", autoColor, { shouldDirty: true });
            const generatedSlug = slugify(watchedName, { lower: true, strict: true });
            form.setValue("slug", generatedSlug, { shouldDirty: true, shouldValidate: true });
        }
    }, [watchedName, form]);

    async function onSubmit(values: ProjectSchemaType) {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(projectsClient.create(values));

            if (error) {
                toast.error(error.message);
                return;
            }

            if (result.success) {
                toast.success("Project created successfully!");
                triggerConfetti();
                router.push(`/w/${workspaceId}/p/${result.data.slug}`);
            } else {
                toast.error(result.message || "Failed to create project");
            }
        });
    }

    if (isLoadingMembers || isLayoutLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading workspace information...</p>
            </div>
        );
    }

    // Final guard before rendering content
    if (!canAccess) return null;

    return (
        <div className="size-full overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <div
                        className="size-5 rounded-full shadow-inner border transition-colors"
                        style={{ backgroundColor: watchedColor || "#000000" }}
                    />
                    <div>
                        <h1 className="text-xl font-medium tracking-tight text-foreground">Create New Project</h1>
                        {/* <p className="text-muted-foreground text-sm">Set up a new project for your workspace.</p> */}
                    </div>
                </div>

                <Button variant="outline" size="sm" asChild className="h-9 gap-2">
                    <Link href={`/w/${workspaceId}`}>
                        <ChevronLeft className="size-4" />
                        Back
                    </Link>
                </Button>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* Basic Info Section */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-primary font-semibold">
                                <Info className="size-5" />
                                <h2 className="text-md">Basic Information</h2>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Project Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Enter project name" {...field} className="h-11" />
                                            </FormControl>
                                            {watchedSlug && (
                                                <p className="text-[11px] text-muted-foreground mt-1 ml-1 font-mono">
                                                    Slug: {watchedSlug}
                                                </p>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="What is this project about?"
                                                    {...field}
                                                    rows={4}
                                                    className="resize-none"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        {/* Team Section */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 text-primary font-semibold">
                                <Users className="size-5" />
                                <h2 className="text-md">Team Assignment</h2>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                {/* Project Manager Selection */}
                                <FormField
                                    control={form.control}
                                    name="projectManagerId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-1.5">
                                                {/* <UserCircle className="size-4" /> */}
                                                Project Manager
                                            </FormLabel>
                                            <div className="pt-1">
                                                {isManager ? (
                                                    <Input
                                                        value={members.find(m => m.userId === permissions?.userId)?.surname || "You"}
                                                        disabled
                                                        className="bg-muted"
                                                    />
                                                ) : (
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button variant="outline" className="w-full justify-between h-11">
                                                                {field.value ? (
                                                                    <Badge variant="secondary" className="font-normal">
                                                                        {members.find(m => m.id === field.value)?.surname || "Unknown"}
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-muted-foreground">Select manager</span>
                                                                )}
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="p-0 w-72" align="start">
                                                            <Command>
                                                                <CommandInput placeholder="Search managers..." />
                                                                <CommandEmpty>No managers found.</CommandEmpty>
                                                                <CommandGroup className="max-h-64 overflow-auto">
                                                                    {members.filter(m => m.workspaceRole === "MANAGER").map((m) => (
                                                                        <CommandItem
                                                                            key={m.id}
                                                                            onSelect={() => {
                                                                                const nextId = field.value === m.id ? "" : m.id;
                                                                                field.onChange(nextId);
                                                                                // Automatically remove this person from memberAccess if they were selected there
                                                                                if (nextId) {
                                                                                    const currentMembers = form.getValues("memberAccess");
                                                                                    if (currentMembers.includes(nextId)) {
                                                                                        form.setValue("memberAccess", currentMembers.filter(id => id !== nextId));
                                                                                    }
                                                                                }
                                                                            }}
                                                                        >
                                                                            <Check className={cn("mr-2 size-4", field.value === m.id ? "opacity-100" : "opacity-0")} />
                                                                            {m.surname}
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>
                                                )}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Member Access Selection */}
                                <FormField
                                    control={form.control}
                                    name="memberAccess"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-1.5">
                                                {/* <Users className="size-4" /> */}
                                                Team Members
                                            </FormLabel>
                                            <div className="pt-1">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-between min-h-[44px] h-auto py-2">
                                                            <div className="flex flex-wrap gap-1">
                                                                {field.value.length > 0 ? (
                                                                    field.value.map(id => (
                                                                        <Badge key={id} variant="outline" className="bg-primary/5">
                                                                            {members.find(m => m.id === id)?.surname || "User"}
                                                                        </Badge>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-muted-foreground">Add team members</span>
                                                                )}
                                                            </div>
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="p-0 w-72" align="start">
                                                        <Command>
                                                            <CommandInput placeholder="Search members..." />
                                                            <CommandEmpty>No members found.</CommandEmpty>
                                                            <CommandGroup className="max-h-64 overflow-auto">
                                                                {members
                                                                    .filter(m => m.workspaceRole !== "OWNER" && m.workspaceRole !== "ADMIN")
                                                                    .map((m) => {
                                                                        const isSelected = field.value.includes(m.id);
                                                                        const isPM = watchedPMId === m.id;

                                                                        return (
                                                                            <CommandItem
                                                                                key={m.id}
                                                                                disabled={isPM}
                                                                                onSelect={() => {
                                                                                    if (isPM) return; // Safety check
                                                                                    if (isSelected) {
                                                                                        field.onChange(field.value.filter(id => id !== m.id));
                                                                                    } else {
                                                                                        field.onChange([...field.value, m.id]);
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <Check className={cn("mr-2 size-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                                <span className={cn(isPM && "font-semibold text-muted-foreground")}>
                                                                                    {m.surname}
                                                                                    {isPM && " (Project Manager)"}
                                                                                </span>
                                                                            </CommandItem>
                                                                        );
                                                                    })}
                                                            </CommandGroup>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Project Tags Selection */}
                                <FormField
                                    control={form.control}
                                    name="tagIds"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-1.5">
                                                Project Tags
                                            </FormLabel>
                                            <div className="pt-1">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-between min-h-[44px] h-auto py-2">
                                                            <div className="flex flex-wrap gap-1">
                                                                {field.value && field.value.length > 0 ? (
                                                                    field.value.map(id => (
                                                                        <Badge key={id} variant="outline" className="bg-primary/5">
                                                                            {toTitleCase(layoutData?.tags?.find((t: any) => t.id === id)?.name) || "Tag"}
                                                                        </Badge>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-muted-foreground">Select project tags</span>
                                                                )}
                                                            </div>
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="p-0 w-72" align="start">
                                                        <Command>
                                                            <CommandInput placeholder="Search workspace tags..." />
                                                            <CommandEmpty>No tags found.</CommandEmpty>
                                                            <CommandGroup className="max-h-64 overflow-auto">
                                                                {(layoutData?.tags || []).map((t: any) => {
                                                                    const isSelected = field.value?.includes(t.id);
                                                                    return (
                                                                        <CommandItem
                                                                            key={t.id}
                                                                            onSelect={() => {
                                                                                const current = field.value || [];
                                                                                if (isSelected) {
                                                                                    field.onChange(current.filter(id => id !== t.id));
                                                                                } else {
                                                                                    field.onChange([...current, t.id]);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <Check className={cn("mr-2 size-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                            {toTitleCase(t.name)}
                                                                        </CommandItem>
                                                                    );
                                                                })}
                                                            </CommandGroup>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Client Info Section */}
                    <div className="space-y-4 pt-6 border-t">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-3 text-primary font-semibold">
                                    <Briefcase className="size-5" />
                                    <h2 className="text-md">Client Information</h2>
                                </div>

                                <FormField
                                    control={form.control}
                                    name="isInternal"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(checked) => {
                                                        field.onChange(checked);
                                                        if (checked) {
                                                            form.setValue("clintId", null);
                                                            form.setValue("companyName", "Internal", { shouldDirty: true });
                                                            form.setValue("registeredCompanyName", "Company Internal Work", { shouldDirty: true });
                                                            form.setValue("directorName", "Internal", { shouldDirty: true });
                                                            form.setValue("address", "N/A", { shouldDirty: true });
                                                            form.setValue("gstNumber", "Internal", { shouldDirty: true });
                                                            form.setValue("contactPerson", "Internal", { shouldDirty: true });
                                                            form.setValue("phoneNumber", "0000000000", { shouldDirty: true });
                                                        } else {
                                                            form.resetField("companyName");
                                                            form.resetField("registeredCompanyName");
                                                            form.resetField("directorName");
                                                            form.resetField("address");
                                                            form.resetField("gstNumber");
                                                            form.resetField("contactPerson");
                                                            form.resetField("phoneNumber");
                                                        }
                                                    }}
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel className="text-sm font-medium cursor-pointer">
                                                    Internal Project?
                                                </FormLabel>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {existingClients.length > 0 && !form.watch("isInternal") && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-8 gap-2">
                                            <Users className="size-3.5" />
                                            Use Existing Client
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-80" align="end">
                                        <Command>
                                            <CommandInput placeholder="Search existing clients..." />
                                            <CommandEmpty>No clients found.</CommandEmpty>
                                            <CommandGroup className="max-h-64 overflow-auto">
                                                {existingClients.map((client) => (
                                                    <CommandItem
                                                        key={client.id}
                                                        onSelect={() => {
                                                            form.setValue("clintId", client.id, { shouldDirty: true });
                                                            form.setValue("companyName", client.name || "", { shouldDirty: true });
                                                            form.setValue("registeredCompanyName", client.registeredCompanyName || "", { shouldDirty: true });
                                                            form.setValue("directorName", client.directorName || "", { shouldDirty: true });
                                                            form.setValue("address", client.address || "", { shouldDirty: true });
                                                            form.setValue("gstNumber", client.gstNumber || "", { shouldDirty: true });

                                                            if (client.clintMembers && client.clintMembers.length > 0) {
                                                                const member = client.clintMembers[0];
                                                                form.setValue("contactPerson", member.name || "", { shouldDirty: true });
                                                                form.setValue("phoneNumber", member.phoneNumber || "", { shouldDirty: true });
                                                            }
                                                            toast.success(`Loaded details for ${client.name}`);
                                                        }}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{client.name}</span>
                                                            {client.registeredCompanyName && (
                                                                <span className="text-[10px] text-muted-foreground">{client.registeredCompanyName}</span>
                                                            )}
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>

                        {!form.watch("isInternal") && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="companyName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Client Company Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Google" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="registeredCompanyName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Registered Company Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Full legal name" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="contactPerson"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Contact Person</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Primary contact name" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="phoneNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Phone Number</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. +91 98765 43210" {...field} />
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
                                                <Input placeholder="12ABCDE3456F7Z8" {...field} maxLength={15} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="directorName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Director Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Authorized signatory" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="address"
                                    render={({ field }) => (
                                        <FormItem className="col-span-full">
                                            <FormLabel>Address</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="Full billing address" {...field} rows={2} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={() => router.back()}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="px-8"
                            disabled={pending}
                        >
                            {pending ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Creating Project...
                                </>
                            ) : (
                                <>
                                    <Plus className="mr-2 size-4" />
                                    Create Project
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
