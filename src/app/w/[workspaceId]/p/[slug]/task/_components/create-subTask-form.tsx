"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition, useState } from "react";
import { Resolver, useForm } from "react-hook-form";
import { Check, Loader2, PlusIcon, SparkleIcon, PenTool, ShoppingCart, Hammer } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { subTaskSchema, SubTaskSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "sonner";
import { ProjectMembersType } from "@/app/data/project/get-project-members";
import slugify from "slugify";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createSubTask } from "../action";

interface iAppProps {
    members: ProjectMembersType
    workspaceId: string,
    projectId: string;
    parentTaskId: string;
}

export const CreateSubTaskForm = ({ members, workspaceId, projectId, parentTaskId }: iAppProps) => {
    const [pending, startTransition] = useTransition();
    const router = useRouter();
    const { triggerConfetti } = useConfetti();
    const [open, setOpen] = useState(false);

    const form = useForm<SubTaskSchemaType>({
        resolver: zodResolver(subTaskSchema) as unknown as Resolver<SubTaskSchemaType>,
        defaultValues: {
            name: "",
            description: "",
            taskSlug: "",
            dueDate: "",
            assignee: "",
            status: "TO_DO",
            tag: "CONTRACTOR",
            projectId: projectId,
            parentTaskId: parentTaskId,
        },
    })

    function onSubmit(data: SubTaskSchemaType) {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(createSubTask(data));
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
                setOpen(false);
            } else (
                toast.error(result.message)
            )
        });
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm">
                    <PlusIcon className="mr-2 size-4" /> Create Sub-Task
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[98vh] w-[min(900px,95vw)] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Create New SubTask</DialogTitle>
                </DialogHeader>

                <div className="mt-4 overflow-y-auto px-2 py-1 max-h-[70vh] thin-scrollbar">
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
                                        <FormLabel>SubTask Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Enter subtask name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className=" flex gap-4 items-end">
                                <FormField
                                    control={form.control}
                                    name="taskSlug"
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
                                    const slug = slugify(nameValue, { lower: true, strict: true });

                                    form.setValue('taskSlug', slug, { shouldValidate: true })
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
                                                placeholder="SubTask description"
                                                className="resize-none"
                                                rows={4}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Tag Selection */}
                            <FormField
                                control={form.control}
                                name="tag"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tag</FormLabel>
                                        <div className="flex gap-4">
                                            {[
                                                { value: "DESIGN", icon: PenTool, label: "Design" },
                                                { value: "PROCUREMENT", icon: ShoppingCart, label: "Procurement" },
                                                { value: "CONTRACTOR", icon: Hammer, label: "Contractor" },
                                            ].map((tag) => (
                                                <div
                                                    key={tag.value}
                                                    className={cn(
                                                        "flex flex-row items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border-2 transition-all",
                                                        field.value === tag.value
                                                            ? "border-primary bg-primary/10"
                                                            : "border-muted hover:border-primary/50"
                                                    )}
                                                    onClick={() => field.onChange(tag.value)}
                                                >
                                                    <tag.icon className="size-4" />
                                                    <span className="text-sm font-medium">{tag.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* two-column block */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="dueDate"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Due Date</FormLabel>
                                            <FormControl>
                                                <Input type="date" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="status"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Status</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Status" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="assignee"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Assignee</FormLabel>
                                        <FormDescription className="text-xs text-muted-foreground mb-2">
                                            Select the assignee (only one allowed).
                                        </FormDescription>
                                        <div className="space-y-2">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between font-normal">
                                                        {field.value
                                                            ? (() => {
                                                                const m = members?.find((m) => m.workspaceMember.user.id === field.value);
                                                                return `${m?.workspaceMember.user.surname || m?.workspaceMember.user.name}`;
                                                            })()
                                                            : "Select assignee"}
                                                    </Button>
                                                </PopoverTrigger>

                                                <PopoverContent className="p-0 w-64">
                                                    <Command>
                                                        <CommandInput placeholder="Search members…" />
                                                        <CommandList>
                                                            <CommandEmpty>No members found.</CommandEmpty>
                                                            <CommandGroup>
                                                                {members?.map((member) => {
                                                                    const user = member.workspaceMember.user;
                                                                    const userName = `${user.name} ${user.surname || ''}`;
                                                                    const userId = user.id;
                                                                    const isSelected = field.value === userId;

                                                                    return (
                                                                        <CommandItem
                                                                            key={userId}
                                                                            value={userName}
                                                                            onSelect={() => {
                                                                                field.onChange(userId);
                                                                            }}
                                                                        >
                                                                            <Check
                                                                                className={cn(
                                                                                    "mr-2 h-4 w-4",
                                                                                    isSelected ? "opacity-100" : "opacity-0"
                                                                                )}
                                                                            />
                                                                            {userName}
                                                                        </CommandItem>
                                                                    );
                                                                })}
                                                            </CommandGroup>
                                                        </CommandList>
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
                                            Create SubTask
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
    );
};
