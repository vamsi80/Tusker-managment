"use client";

import React, { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { createTeamMemberColumns } from "./team-member-columns";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { apiClient, type ApiResponse } from "@/lib/api-client";
import { type WorkspaceMemberRow } from "@/types/workspace";
import { format } from "date-fns";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateMemberSchema, UpdateMemberSchemaType, workspaceMemberRole } from "@/lib/zodSchemas";
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


interface TeamMembersProps {
    data: WorkspaceMemberRow[];
    isAdmin: boolean;
    workspaceId: string;
    pagination?: {
        page: number;
        limit: number;
        totalCount: number;
        search?: string;
        onSearchChange?: (search: string) => void;
        onPageChange: (page: number) => void;
        onLimitChange: (limit: number) => void;
    };
}

export function TeamMembers({ data, isAdmin, workspaceId, pagination }: TeamMembersProps) {
    const router = useRouter();


    // View member dialog state
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [memberToView, setMemberToView] = useState<WorkspaceMemberRow | null>(null);

    // Edit member state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [memberToEdit, setMemberToEdit] = useState<WorkspaceMemberRow | null>(null);

    // Delete member state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [memberToDelete, setMemberToDelete] = useState<WorkspaceMemberRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [managers, setManagers] = useState<{ id: string; surname: string }[]>([]);

    React.useEffect(() => {
        const fetchManagers = async () => {
            const result: ApiResponse = await apiClient.workspaces.getManagers(workspaceId);
            if (result.status === "success") {
                setManagers(result.data);
            }
        };
        if (editDialogOpen) {
            fetchManagers();
        }
    }, [workspaceId, editDialogOpen]);

    const editForm = useForm<UpdateMemberSchemaType>({
        resolver: zodResolver(updateMemberSchema as any),
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
            workspaceId: workspaceId,
        },
    });

    const handleViewMember = React.useCallback((member: WorkspaceMemberRow) => {
        setMemberToView(member);
        setViewDialogOpen(true);
    }, []);

    const handleEditMember = React.useCallback((member: WorkspaceMemberRow) => {
        setMemberToEdit(member);
        editForm.reset({
            name: member.name || "",
            surname: member.surname || "",
            email: member.email || "",
            phoneNumber: member.phoneNumber || "",
            role: member.workspaceRole as any,
            designation: member.designation || "",
            employeeId: member.employeeId || "",
            dateOfBirth: member.dateOfBirth ? (member.dateOfBirth instanceof Date ? member.dateOfBirth.toISOString().split('T')[0] : member.dateOfBirth.toString().split('T')[0]) : "",
            reportToId: member.reportToId || "",
            workspaceId: workspaceId,
        });
        setEditDialogOpen(true);
    }, [editForm, workspaceId]);

    const handleEditConfirm = async (values: UpdateMemberSchemaType) => {
        if (!memberToEdit) return;

        setIsUpdating(true);
        try {
            const result: ApiResponse = await apiClient.workspaces.updateMember(workspaceId, memberToEdit.id, values);

            if (result.status === "success") {
                toast.success(result.message);
                if ((result as any).emailChanged) {
                    toast.info("Email was changed. A new verification link has been sent.");
                }
                setEditDialogOpen(false);
                setMemberToEdit(null);
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

    const handleDeleteMember = React.useCallback((member: WorkspaceMemberRow) => {
        setMemberToDelete(member);
        setDeleteDialogOpen(true);
    }, []);

    const handleDeleteConfirm = async () => {
        if (!memberToDelete) return;

        setIsDeleting(true);
        try {
            const result: ApiResponse = await apiClient.workspaces.removeMember(workspaceId, memberToDelete.id);

            if (result.status === "success") {
                toast.success(result.message);
                setDeleteDialogOpen(false);
                setMemberToDelete(null);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            toast.error("Failed to remove member");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleResetPassword = React.useCallback(async (member: WorkspaceMemberRow) => {
        if (!member.email) return;

        toast.promise(
            apiClient.workspaces.resetPassword(workspaceId, member.id),
            {
                loading: `Sending password reset email to ${member.name}...`,
                success: (result: any) => {
                    if (result.status === "error") throw new Error(result.message);
                    return result.message || "Password reset email sent successfully";
                },
                error: (err) => err.message || "Failed to send password reset email",
            }
        );
    }, [workspaceId]);

    const columns = React.useMemo(() =>
        createTeamMemberColumns(
            isAdmin,
            handleViewMember,
            handleEditMember,
            handleDeleteMember,
            handleResetPassword
        ),
        [isAdmin, handleViewMember, handleEditMember, handleDeleteMember, handleResetPassword]
    );

    return (
        <>
            <DataTable
                columns={columns}
                data={data}
                searchKey="memberName"
                searchPlaceholder="Search members..."
                onRowClick={handleViewMember}
                showPagination={true}
                showColumnToggle={true}
                manualPagination={!!pagination}
                manualFiltering={true}
                rowCount={pagination?.totalCount}
                pageIndex={(pagination?.page || 1) - 1}
                pageSize={pagination?.limit || 10}
                onPaginationChange={(p) => {
                    if (pagination) {
                        if (p.pageSize !== pagination.limit) {
                            pagination.onLimitChange(p.pageSize);
                        } else {
                            pagination.onPageChange(p.pageIndex + 1);
                        }
                    }
                }}
                onFilterChange={(filters) => {
                    if (pagination?.onSearchChange) {
                        const searchFilter = filters.find(f => f.id === "memberName");
                        const searchValue = searchFilter?.value as string || "";
                        pagination.onSearchChange(searchValue);
                    }
                }}
            />

            {/* View Member Dialog */}
            <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Member Details</DialogTitle>
                    </DialogHeader>
                    {memberToView && (
                        <div className="space-y-4 py-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="size-16">
                                    <AvatarFallback className="text-xl">
                                        {memberToView.name?.charAt(0) || "?"}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="text-lg font-medium">
                                        {memberToView.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {memberToView.email}
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-3">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Surname:</span>
                                    <span className="font-medium">
                                        {memberToView.surname || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Role:</span>
                                    <span className="font-medium capitalize">
                                        {memberToView.workspaceRole.toLowerCase().replace("_", " ")}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Employee ID:</span>
                                    <span className="font-medium font-mono text-xs">
                                        {memberToView.employeeId || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">DOB:</span>
                                    <span className="font-medium">
                                        {memberToView.dateOfBirth ? format(new Date(memberToView.dateOfBirth), "dd MMM yyyy") : "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Phone:</span>
                                    <span className="font-medium">
                                        {memberToView.phoneNumber || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Status:</span>
                                    {(() => {
                                        const isVerified = memberToView.status === "Verified";
                                        return (
                                            <span className={cn(
                                                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium border-transparent",
                                                isVerified
                                                    ? "bg-green-500/10 text-green-500"
                                                    : "bg-amber-500/10 text-amber-500"
                                            )}>
                                                {memberToView.status}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Edit Member Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
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
                                            <FormLabel>First Name</FormLabel>
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
                                            <FormLabel>Last Name</FormLabel>
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
                                                <Input {...field} type="date" value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : (field.value || "")} disabled={isUpdating} />
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
                                                    {managers.length > 0 ? managers.map((manager) => (
                                                        <SelectItem key={manager.id} value={manager.id}>
                                                            {manager.surname}
                                                        </SelectItem>
                                                    )) : (
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
                                                {workspaceMemberRole.filter(role => role !== "OWNER").map((role) => (
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
                                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isUpdating}>
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

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Member</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove{" "}
                            <span className="font-medium">
                                {memberToDelete?.name}
                            </span>{" "}
                            from this workspace? They will lose access to all projects
                            and tasks in this workspace.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                "Remove Member"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
