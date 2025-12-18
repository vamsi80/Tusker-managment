"use client";

import slugify from "slugify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { tryCatch } from "@/hooks/try-catch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConfetti } from "@/hooks/use-confetti";
import { Resolver, useForm } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { WorkspaceMembersResult } from "@/data/workspace";
import { createProject } from "@/actions/project/create-project";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
import { Check, Loader2, Plus, PlusIcon, SparkleIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface iAppProps {
    members: WorkspaceMembersResult["workspaceMembers"]
    workspaceId: string,
    isAdmin: boolean;
}

export const CreateProjectForm = ({ members, workspaceId, isAdmin }: iAppProps) => {
    const [pending, startTransition] = useTransition();
    const router = useRouter();
    const { triggerConfetti } = useConfetti();

    const form = useForm<ProjectSchemaType>({
        resolver: zodResolver(projectSchema) as unknown as Resolver<ProjectSchemaType>,
        defaultValues: {
            name: "",
            description: "",
            slug: "",
            address: "",
            directorName: "",
            companyName: "",
            registeredCompanyName: "",
            gstNumber: "",
            contactPerson: "",
            contactNumber: "",
            workspaceId: workspaceId as string,
            projectLead: "",
            memberAccess: [] as string[],
        },
    })

    function onSubmit(data: ProjectSchemaType) {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(createProject(data));
            console.log("results", { result });

            if (error) {
                toast.error(error.message);
                console.error(error);
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                triggerConfetti();
                form.reset();
                router.push(`/w/${workspaceId}`);
            } else (
                toast.error(result.message)
            )
        });
    }

    // --- Updated CreateProjectDialog.tsx (JSX / TSX) ---
    return (
        <>
            <Dialog>
                {isAdmin && (
                    <DialogTrigger asChild>
                        <button className="cursor-pointer">
                            <Plus size={16} />
                        </button>
                    </DialogTrigger>
                )}
                {/* Make the dialog content scrollable when form grows */}
                <DialogContent className="max-h-[98vh] w-[min(900px,95vw)] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>

                    {/* The scrollable area. Keeps header/footer sticky if you want:
                        - header is above already; if you want sticky footer, wrap form and footer separately. */}
                    <div className="mt-4 overflow-y-auto px-2 py-1 max-h-[70vh] thin-scrollbar">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Project Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Enter project name" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className=" flex gap-4 items-end">
                                    <FormField
                                        control={form.control}
                                        name="slug"
                                        render={({ field }) => (
                                            <FormItem className="w-full">
                                                <FormLabel>Slug</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Slug"{...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="button" className="w-fit" onClick={() => {
                                        const nameValue = form.getValues("name");
                                        const slug = slugify(nameValue)

                                        form.setValue('slug', slug, { shouldValidate: true })
                                    }}>
                                        Generate Slug <SparkleIcon className="ml-1" size={16} />
                                    </Button>
                                </div>

                                {/* Description */}
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...field}
                                                    placeholder="Project description"
                                                    className="resize-none"
                                                    rows={4}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* two-column block */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="companyName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Company Name</FormLabel>
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
                                                    <Input placeholder="Registered company name" {...field} />
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
                                                    <Input placeholder="eg: John Doe (MD)" {...field} />
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
                                                    <Input placeholder="eg:#123, Street name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <FormField
                                    control={form.control}
                                    name="gstNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>GST Number</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder="12ABCDE3456F7Z8"
                                                    inputMode="text"
                                                    maxLength={15}
                                                />
                                            </FormControl>
                                            <FormDescription className="text-xs text-muted-foreground">
                                                {/* GST is usually 15 characters — alphanumeric. (Add validation in schema) */}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* contact details */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="contactPerson"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Contact Person Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="e.g. John Doe" {...field} type="text" />
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
                                                    <Input
                                                        placeholder="e.g. +91 98765 43210"
                                                        {...field}
                                                        type="tel"
                                                        inputMode="tel"
                                                    />
                                                </FormControl>
                                                <FormDescription className="text-xs text-muted-foreground">
                                                    {/* Include country code. (Validate with pattern or phone library.) */}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="projectLead"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Project Lead</FormLabel>
                                            <FormDescription className="text-xs text-muted-foreground mb-2">
                                                Select the project lead (only one allowed).
                                            </FormDescription>
                                            <div className="space-y-2">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-between font-normal">
                                                            {field.value
                                                                ? (() => {
                                                                    const m = members?.find((m) => m.userId === field.value);
                                                                    return `${m?.user?.surname}`;
                                                                })()
                                                                : "Select a team lead"}
                                                        </Button>
                                                    </PopoverTrigger>

                                                    <PopoverContent className="p-0 w-64">
                                                        <Command>
                                                            <CommandInput placeholder="Search members…" />
                                                            <CommandEmpty>No members found.</CommandEmpty>

                                                            <CommandGroup>
                                                                {members?.filter(m => m.workspaceRole === "MEMBER").map((member) => {
                                                                    const userName = `${member.user?.surname}`;
                                                                    const accessLevelRaw =
                                                                        (member as any)?.accessLevel ??
                                                                        (member as any)?.role ??
                                                                        "Lead";

                                                                    const accessLevel =
                                                                        typeof accessLevelRaw === "string"
                                                                            ? accessLevelRaw.toLowerCase()
                                                                            : "member";

                                                                    // Check if this member is the one selected
                                                                    const isSelected = field.value === member.userId;

                                                                    return (
                                                                        <CommandItem
                                                                            key={member.userId}
                                                                            value={userName}
                                                                            onSelect={() => {
                                                                                // Single select: set the value to this user
                                                                                field.onChange(member.userId);
                                                                            }}
                                                                        >
                                                                            <Check
                                                                                className={cn(
                                                                                    "mr-2 h-4 w-4",
                                                                                    isSelected ? "opacity-100" : "opacity-0"
                                                                                )}
                                                                            />
                                                                            {userName} ({accessLevel})
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

                                <div className="flex justify-end items-center gap-4 pt-2 mb-2">
                                    <Button type="submit" disabled={pending}>
                                        {pending ? (
                                            <>
                                                Creating...
                                                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                            </>
                                        ) : (
                                            <>
                                                Create Project
                                                <PlusIcon className="ml-1" size={16} />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
