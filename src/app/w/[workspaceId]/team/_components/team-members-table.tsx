"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { apiClient, type ApiResponse } from "@/lib/api-client";
import { type WorkspaceMemberRow } from "@/types/workspace";

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
    onRefresh: () => Promise<void>;
    isRefreshing: boolean;
}

export function TeamMembers({ data, isAdmin, workspaceId, onRefresh, isRefreshing }: TeamMembersProps) {
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
    const [newRole, setNewRole] = useState<string>("");
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

    // Refresh logic is now handled globally via RealtimeNotificationListener



    const editForm = useForm<UpdateMemberSchemaType>({
        resolver: zodResolver(updateMemberSchema),
        defaultValues: {
            name: "",
            surname: "",
            email: "",
            phoneNumber: "",
            role: "MEMBER",
            designation: "",
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
            name: member.user?.name || "",
            surname: member.user?.surname || "",
            email: member.user?.email || "",
            phoneNumber: member.user?.phoneNumber || "",
            role: member.workspaceRole as any,
            designation: member.designation || "",
            reportToId: member.reportToId || "",
            workspaceId: workspaceId,
        });
        setEditDialogOpen(true);
    }, [editForm]);

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
                await onRefresh();
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
                await onRefresh();
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

    const handleResendInvite = React.useCallback(async (member: WorkspaceMemberRow) => {
        if (!member.user?.email) return;

        toast.promise(
            apiClient.workspaces.resendInvite(workspaceId, member.id),
            {
                loading: `Resending invitation to ${member.user.email}...`,
                success: (result: any) => {
                    if (result.status === "error") throw new Error(result.message);
                    return result.message || "Invitation resent successfully";
                },
                error: (err) => err.message || "Failed to resend invitation",
            }
        );
    }, [workspaceId]);

    const columns = React.useMemo(() =>
        createTeamMemberColumns(
            isAdmin,
            handleViewMember,
            handleEditMember,
            handleDeleteMember,
            handleResendInvite
        ),
        [isAdmin, handleViewMember, handleEditMember, handleDeleteMember, handleResendInvite]
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
                pageSize={10}
                extraToolbarContent={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRefresh()}
                        disabled={isRefreshing}
                        className="h-8 gap-2"
                    >
                        <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                        <span className="hidden sm:inline text-xs">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
                    </Button>
                }
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
                                <Avatar className="h-16 w-16">
                                    <AvatarImage
                                        src={memberToView.user?.image || ""}
                                        alt={memberToView.user?.name || ""}
                                    />
                                    <AvatarFallback className="text-xl">
                                        {memberToView.user?.name?.charAt(0) || "?"}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="text-lg font-semibold">
                                        {memberToView.user?.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {memberToView.user?.email}
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-3">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Surname:</span>
                                    <span className="font-medium">
                                        {memberToView.user?.surname || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Role:</span>
                                    <span className="font-medium capitalize">
                                        {memberToView.workspaceRole.toLowerCase().replace("_", " ")}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Phone:</span>
                                    <span className="font-medium">
                                        {memberToView.user?.phoneNumber || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Status:</span>
                                    {(() => {
                                        const isVerified = memberToView.user?.emailVerified || (memberToView.user?._count?.accounts ?? 0) > 0;
                                        return (
                                            <span className={cn(
                                                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent",
                                                isVerified
                                                    ? "bg-green-500/10 text-green-500"
                                                    : "bg-amber-500/10 text-amber-500"
                                            )}>
                                                {isVerified ? "Verified" : "Pending"}
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
                                            <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
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
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                            <span className="font-semibold">
                                {memberToDelete?.user?.name}
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
