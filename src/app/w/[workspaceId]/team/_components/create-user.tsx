"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Plus } from "lucide-react";
import { z } from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { inviteUserToWorkspace } from "@/lib/actions/invite-user";

// Enum matching your Prisma schema
enum WorkspaceRole {
    ADMIN = "ADMIN",
    MEMBER = "MEMBER",
    VIEWER = "VIEWER",
}

// Correct schema for user invitation
const inviteUserSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            "Password must contain at least one uppercase letter, one lowercase letter, and one number"
        ),
    role: z.enum(WorkspaceRole),
    workspaceId: z.string(),
});

type InviteUserSchemaType = z.infer<typeof inviteUserSchema>;

interface InviteUserFormProps {
    workspaceId: string;
}

export const InviteUserForm = ({ workspaceId }: InviteUserFormProps) => {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<InviteUserSchemaType>({
        resolver: zodResolver(inviteUserSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            role: WorkspaceRole.MEMBER,
            workspaceId,
        },
    });
    async function onSubmit(values: InviteUserSchemaType) {
        setIsSubmitting(true);
        try {
            await inviteUserToWorkspace(values);
            toast.success("User invited successfully!");
            form.reset();
            setOpen(false);
        } catch (error) {
            toast.error("Failed to invite user. Please try again.");
            console.error("Submission error:", error);
        } finally {
            setIsSubmitting(false);
        }
    }


    function onInvalid(errors: any) {
        console.error("Validation errors:", errors);
        toast.error("Please check all required fields");
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    Invite User
                    <Plus className="ml-2" size={16} />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Invite New User</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
                        className="space-y-4"
                    >
                        {/* Hidden field for workspaceId */}
                        <input
                            type="hidden"
                            {...form.register("workspaceId")}
                            value={workspaceId}
                        />

                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Full Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="John Doe"
                                            {...field}
                                            disabled={isSubmitting}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email Address</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            placeholder="john@example.com"
                                            {...field}
                                            disabled={isSubmitting}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Password</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            placeholder="••••••••"
                                            {...field}
                                            disabled={isSubmitting}
                                        />
                                    </FormControl>
                                    <FormDescription className="text-xs">
                                        Min. 8 chars with uppercase, lowercase & number
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Role</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        disabled={isSubmitting}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a role" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value={WorkspaceRole.MEMBER}>
                                                Member
                                            </SelectItem>
                                            <SelectItem value={WorkspaceRole.ADMIN}>
                                                Admin
                                            </SelectItem>
                                            <SelectItem value={WorkspaceRole.VIEWER}>
                                                Viewer
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" disabled={isSubmitting} className="w-full">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Inviting...
                                </>
                            ) : (
                                <>
                                    <Plus className="mr-2" size={16} />
                                    Invite User
                                </>
                            )}
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
