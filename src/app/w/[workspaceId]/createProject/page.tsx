"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { projectsClient } from "@/lib/api-client/projects";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, Resolver } from "react-hook-form";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import { useConfetti } from "@/hooks/use-confetti";
import slugify from "slugify";
import { getColorFromString, generateRandomColor } from "@/lib/colors/project-colors";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Form,
    FormControl,
    FormDescription,
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
    UserCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type WorkspaceMembersResult } from "@/types/workspace";
import Link from "next/link";

export default function CreateProjectPage() {
    const { workspaceId, data: layoutData } = useWorkspaceLayout();
    const { permissions } = layoutData;
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const { triggerConfetti } = useConfetti();

    const [members, setMembers] = useState<WorkspaceMembersResult["workspaceMembers"]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(true);

    // --- Access Control ---
    const isManager = permissions?.workspaceRole === "MANAGER";
    const isAdminOrOwner = permissions?.workspaceRole === "ADMIN" || permissions?.workspaceRole === "OWNER";
    const canAccess = isManager || isAdminOrOwner;

    useEffect(() => {
        // Only redirect if data has loaded and user is explicitly not authorized
        if (!isLoadingMembers && !canAccess) {
            toast.error("You do not have permission to create projects in this workspace.");
            router.push(`/w/${workspaceId}`);
        }
    }, [isLoadingMembers, canAccess, workspaceId, router]);

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

    const form = useForm<ProjectSchemaType>({
        resolver: zodResolver(projectSchema) as unknown as Resolver<ProjectSchemaType>,
        defaultValues: {
            name: "",
            description: "",
            slug: "",
            color: generateRandomColor(),
            workspaceId: workspaceId,
            projectManagerId: "",
            memberAccess: [],
            companyName: "",
            registeredCompanyName: "",
            directorName: "",
            address: "",
            gstNumber: "",
            contactPerson: "",
            phoneNumber: "",
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

    if (isLoadingMembers) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading workspace members...</p>
            </div>
        );
    }

    // Final guard before rendering content
    if (!canAccess) return null;

    return (
        <div className="w-full h-full overflow-y-auto">
            <div className="mb-8">
                <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
                    <Link href={`/w/${workspaceId}`}>
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Back to Dashboard
                    </Link>
                </Button>
                <div className="flex items-center gap-4">
                    <div
                        className="h-10 w-10 rounded-xl shadow-inner border transition-colors"
                        style={{ backgroundColor: watchedColor || "#000000" }}
                    />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Create New Project</h1>
                        <p className="text-muted-foreground">Set up a new project for your workspace.</p>
                    </div>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Basic Info Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-primary font-semibold">
                            <Info className="h-5 w-5" />
                            <h2 className="text-lg">Basic Information</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem className="col-span-full">
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
                                    <FormItem className="col-span-full">
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
                    <div className="space-y-6 pt-6 border-t">
                        <div className="flex items-center gap-3 text-primary font-semibold">
                            <Users className="h-5 w-5" />
                            <h2 className="text-lg">Team Assignment</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Project Manager Selection */}
                            <FormField
                                control={form.control}
                                name="projectManagerId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center gap-1.5">
                                            <UserCircle className="h-4 w-4" />
                                            Project Manager
                                        </FormLabel>
                                        <FormDescription className="text-xs">
                                            {isManager
                                                ? "You are assigned as the manager for this project."
                                                : "Choose who will lead this project."}
                                        </FormDescription>
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
                                                                        onSelect={() => field.onChange(field.value === m.id ? "" : m.id)}
                                                                    >
                                                                        <Check className={cn("mr-2 h-4 w-4", field.value === m.id ? "opacity-100" : "opacity-0")} />
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
                                            <Users className="h-4 w-4" />
                                            Team Members
                                        </FormLabel>
                                        <FormDescription className="text-xs">
                                            Select additional members to grant access to this project.
                                        </FormDescription>
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
                                                                    const isPM = form.getValues("projectManagerId") === m.id;

                                                                    return (
                                                                        <CommandItem
                                                                            key={m.id}
                                                                            disabled={isPM}
                                                                            onSelect={() => {
                                                                                if (isSelected) {
                                                                                    field.onChange(field.value.filter(id => id !== m.id));
                                                                                } else {
                                                                                    field.onChange([...field.value, m.id]);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                            <span className={cn(isPM && "text-muted-foreground")}>
                                                                                {m.surname}
                                                                                {isPM && " (PM)"}
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
                        </div>
                    </div>

                    {/* Client Info Section */}
                    <div className="space-y-4 pt-6 border-t">
                        <div className="flex items-center gap-3 text-primary font-semibold">
                            <Briefcase className="h-5 w-5" />
                            <h2 className="text-lg">Client Information</h2>
                        </div>

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
                        </div>
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating Project...
                                </>
                            ) : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
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
