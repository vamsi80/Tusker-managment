"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { apiClient, type ApiResponse } from "@tusker/api-client";
import {
    updateMemberSchema,
    type UpdateMemberSchemaType,
    workspaceMemberRole,
} from "@tusker/core/lib/zodSchemas";
import type { WorkspaceMemberRow } from "@tusker/core/types/workspace";
import { listDepartments } from "@/actions/department/department-actions";

// Radix Select cannot hold an empty string, so "no department" needs a sentinel.
const NO_DEPARTMENT = "__none__";

export interface EditMemberDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceId: string;
    member: WorkspaceMemberRow | null;
    onSuccess?: (updatedMember?: WorkspaceMemberRow) => void;
}

export function EditMemberDialog({
    open,
    onOpenChange,
    workspaceId,
    member,
    onSuccess,
}: EditMemberDialogProps) {
    const router = useRouter();
    const [isUpdating, setIsUpdating] = useState(false);
    const [managers, setManagers] = useState<{ id: string; surname: string }[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

    const editForm = useForm<UpdateMemberSchemaType>({
        resolver: zodResolver(updateMemberSchema),
        defaultValues: {
            name: "",
            surname: "",
            email: "",
            phoneNumber: "",
            role: "MEMBER",
            designation: "",
            employeeId: "",
            dateOfBirth: "",
            reportToId: "",
            departmentId: "",
            workspaceId: workspaceId,
        },
    });

    useEffect(() => {
        if (!open) return;

        const fetchManagers = async () => {
            const result: ApiResponse = await apiClient.workspaces.getManagers(workspaceId);
            if (result.status === "success") {
                setManagers(result.data);
            }
        };

        fetchManagers();
        listDepartments(workspaceId).then((res) => setDepartments(res.data));
    }, [workspaceId, open]);

    useEffect(() => {
        if (open && member) {
            editForm.reset({
                name: member.name || "",
                surname: member.surname || "",
                email: member.email || "",
                phoneNumber: member.phoneNumber || "",
                role: (member.workspaceRole as any) || "MEMBER",
                designation: member.designation || "",
                employeeId: member.employeeId || "",
                dateOfBirth: member.dateOfBirth
                    ? (member.dateOfBirth instanceof Date
                        ? member.dateOfBirth.toISOString().split("T")[0]
                        : member.dateOfBirth.toString().split("T")[0])
                    : "",
                reportToId: member.reportToId || "",
                departmentId: member.departmentId || "",
                workspaceId: workspaceId,
            });
        }
    }, [open, member, workspaceId, editForm]);

    const handleEditConfirm = async (values: UpdateMemberSchemaType) => {
        if (!member) return;

        setIsUpdating(true);
        try {
            const result: ApiResponse = await apiClient.workspaces.updateMember(workspaceId, member.id, values);

            if (result.status === "success") {
                toast.success(result.message);
                if ((result as any).emailChanged) {
                    toast.info("Email was changed. A new verification link has been sent.");
                }
                onOpenChange(false);
                if (result.data) {
                    window.dispatchEvent(
                        new CustomEvent("realtime-sync-refresh", {
                            detail: {
                                action: "MEMBER_UPDATED",
                                category: "MEMBER",
                                record: result.data,
                                isActor: true,
                            },
                        })
                    );
                }
                onSuccess?.(result.data);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to update member");
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                    <DialogTitle>Edit Member Details</DialogTitle>
                </DialogHeader>
                <Form {...editForm}>
                    <form onSubmit={editForm.handleSubmit(handleEditConfirm)} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={editForm.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Full Name</FormLabel>
                                        <FormControl>
                                            <Input {...field} disabled={isUpdating} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="surname"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nickname</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value || ""} disabled={isUpdating} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={editForm.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email Address</FormLabel>
                                    <FormControl>
                                        <Input {...field} type="email" disabled={isUpdating} />
                                    </FormControl>
                                    <FormDescription>
                                        Changing email will require the user to re-verify and set a new password.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={editForm.control}
                                name="employeeId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Employee ID</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value || ""} disabled={isUpdating} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="dateOfBirth"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Date of Birth</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                type="date"
                                                value={
                                                    field.value instanceof Date
                                                        ? field.value.toISOString().split("T")[0]
                                                        : (field.value || "")
                                                }
                                                disabled={isUpdating}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={editForm.control}
                                name="designation"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Designation</FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value || ""} disabled={isUpdating} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="reportToId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Report To</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Manager" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {managers.length > 0 ? (
                                                    managers.map((manager) => (
                                                        <SelectItem key={manager.id} value={manager.id}>
                                                            {manager.surname}
                                                        </SelectItem>
                                                    ))
                                                ) : (
                                                    <div className="p-2 text-xs text-muted-foreground">No managers found</div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={editForm.control}
                            name="departmentId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Department</FormLabel>
                                    <Select
                                        onValueChange={(value) => field.onChange(value === NO_DEPARTMENT ? "" : value)}
                                        value={field.value || NO_DEPARTMENT}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select Department" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                                            {departments.map((department) => (
                                                <SelectItem key={department.id} value={department.id}>
                                                    {department.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={editForm.control}
                            name="phoneNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Phone Number</FormLabel>
                                    <FormControl>
                                        <Input {...field} value={field.value || ""} disabled={isUpdating} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={editForm.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Role</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a role" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {workspaceMemberRole
                                                .filter((role) => role !== "OWNER")
                                                .map((role) => (
                                                    <SelectItem key={role} value={role}>
                                                        {role.charAt(0) + role.slice(1).toLowerCase()}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isUpdating}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isUpdating}>
                                {isUpdating ? (
                                    <>
                                        <Loader2 className="mr-2 size-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    "Save Changes"
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
