"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { Resolver, useForm } from "react-hook-form";
import { Loader2, Plus, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";
import { createProject } from "../../action";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { WorkspaceProjectsType } from "@/app/data/workspace/get-workspace-members";

interface iAppProps {
    members: WorkspaceProjectsType["workspaceMembers"]
    workspaceId: string,
}

export const CreateProjectForm = ({ members, workspaceId }: iAppProps) => {
    const [pending, startTransition] = useTransition();
    const router = useRouter();
    const { triggerConfetti } = useConfetti();

    const form = useForm<ProjectSchemaType>({
        resolver: zodResolver(projectSchema) as unknown as Resolver<ProjectSchemaType>,
        defaultValues: {
            name: "",
            description: "",
            address: "",
            directorName: "",
            companyName: "",
            registeredCompanyName: "",
            gstNumber: "",
            contactPerson: "",
            contactNumber: "",
            workspaceId: workspaceId as string,
            projectLead: [],
            memberAccess: [],
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
                <DialogTrigger asChild>
                    <button className="cursor-pointer">
                        <Plus size={16} />
                    </button>
                </DialogTrigger>

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
                                            <FormDescription className="text-xs text-muted-foreground mb-4">
                                                Select which workspace members should have Lead the project.
                                            </FormDescription>
                                            <div className="space-y-2">
                                                {members?.map((member) => (
                                                    <div
                                                        key={member.userId}
                                                        className="flex items-center space-x-2"
                                                    >
                                                        <Checkbox
                                                            id={member.userId}
                                                            checked={field.value?.includes(member.userId)}
                                                            onCheckedChange={(checked) => {
                                                                const currentValue = field.value || [];
                                                                if (checked) {
                                                                    field.onChange([...currentValue, member.userId]);
                                                                } else {
                                                                    field.onChange(
                                                                        currentValue.filter((id) => id !== member.userId)
                                                                    );
                                                                }
                                                            }}
                                                        />
                                                        <label
                                                            htmlFor={member.userId}
                                                            className="text-sm font-medium leading-none capitalize cursor-pointer"
                                                        >
                                                            {member.user.name} ({member.accessLevel.toLowerCase()})
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Project access (checkbox list) */}
                                <FormField
                                    control={form.control}
                                    name="memberAccess"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Project Access</FormLabel>
                                            <FormDescription className="text-xs text-muted-foreground mb-4">
                                                Select which workspace members should have access to this project.
                                            </FormDescription>
                                            <div className="space-y-2">
                                                {members?.map((member) => (
                                                    <div
                                                        key={member.userId}
                                                        className="flex items-center space-x-2"
                                                    >
                                                        <Checkbox
                                                            id={member.userId}
                                                            checked={field.value?.includes(member.userId)}
                                                            onCheckedChange={(checked) => {
                                                                const currentValue = field.value || [];
                                                                if (checked) {
                                                                    field.onChange([...currentValue, member.userId]);
                                                                } else {
                                                                    field.onChange(
                                                                        currentValue.filter((id) => id !== member.userId)
                                                                    );
                                                                }
                                                            }}
                                                        />
                                                        <label
                                                            htmlFor={member.userId}
                                                            className="text-sm font-medium leading-none capitalize cursor-pointer"
                                                        >
                                                            {member.user.name} ({member.accessLevel.toLowerCase()})
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* submit footer (kept inside scroll area so user can submit when scrolled) */}
                                <div className="flex justify-end items-center gap-4 pt-2 mb-5">
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
