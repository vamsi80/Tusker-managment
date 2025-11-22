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
import { createNewProject } from "../action";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { WorkspaceProjectsType } from "@/app/data/workspace/get-workspace-members";

interface iAppProps {
    members: WorkspaceProjectsType["workspaceMembers"]
    workspaceId: string
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
            workspaceId: workspaceId as string,
            memberAccess: [],
        },
    })

    function onSubmit(data: ProjectSchemaType) {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(createNewProject(data));
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
                router.push(`/${workspaceId}`);
            } else (
                toast.error(result.message)
            )
        });
    }

    return (
        <>
            <Dialog>
                <DialogTrigger asChild>
                    <button className="cursor-pointer">
                        <Plus size={16} />
                    </button>
                </DialogTrigger>
                <DialogContent >
                    <DialogHeader>
                        <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-5"
                            >
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Project Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Enter workspace name" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Bio</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...field}
                                                    placeholder="Workspace description"
                                                    className="resize-none"
                                                ></Textarea>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                <div>
                                    <FormField
                                        control={form.control}
                                        name="memberAccess"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Project Access</FormLabel>

                                                <FormDescription className="text-xs text-muted-foreground mb-4">
                                                    Select which workspace members should have access to
                                                    this project
                                                </FormDescription>

                                                <div>
                                                    {members?.map((member) => (
                                                        <div
                                                            key={member?.userId}
                                                            className="flex items-center space-x-2"
                                                        >
                                                            <Checkbox
                                                                id={member.userId}
                                                                checked={field.value?.includes(member.userId)}
                                                                onCheckedChange={(checked) => {
                                                                    const currentValue = field.value || [];
                                                                    if (checked) {
                                                                        field.onChange([
                                                                            ...currentValue,
                                                                            member.userId,
                                                                        ]);
                                                                    } else {
                                                                        field.onChange(
                                                                            currentValue.filter(
                                                                                (id) => id !== member.userId
                                                                            )
                                                                        );
                                                                    }
                                                                }}
                                                            />

                                                            <label
                                                                htmlFor={member.userId}
                                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize cursor-pointer"
                                                            >
                                                                {member.user.name} (
                                                                {member.accessLevel.toLowerCase()})
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="flex flex-row items-center gap-4">
                                    <Button type="submit" disabled={pending}>
                                        {
                                            pending ? (
                                                <>
                                                    Creating...
                                                    <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                                </>
                                            ) : (
                                                <>
                                                    Create Course
                                                    <PlusIcon className="ml-1" size={16} />
                                                </>
                                            )
                                        }
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
