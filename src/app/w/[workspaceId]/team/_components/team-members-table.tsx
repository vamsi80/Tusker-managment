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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { WorkspaceMemberRow } from "@/data/workspace";
import { pusherClient } from "@/lib/pusher";
import { TEAM_UPDATE, TeamEventData } from "@/lib/realtime";


interface TeamMembersProps {
    data: WorkspaceMemberRow[];
    isAdmin: boolean;
    workspaceId: string;
}

export function TeamMembers({ data, isAdmin, workspaceId }: TeamMembersProps) {
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

    // Refresh logic is now handled globally via RealtimeNotificationListener



    const handleViewMember = React.useCallback((member: WorkspaceMemberRow) => {
        setMemberToView(member);
        setViewDialogOpen(true);
    }, []);

    const handleEditMember = React.useCallback((member: WorkspaceMemberRow) => {
        setMemberToEdit(member);
        setNewRole(member.workspaceRole);
        setEditDialogOpen(true);
    }, []);

    const handleEditConfirm = async () => {
        if (!memberToEdit || !newRole) return;

        setIsUpdating(true);
        try {
            const result = await apiClient.workspaces.updateMemberRole(workspaceId, memberToEdit.id, newRole);

            if (result.status === "success") {
                toast.success(result.message);
                setEditDialogOpen(false);
                setMemberToEdit(null);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            toast.error("Failed to update member role");
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
            const result = await apiClient.workspaces.removeMember(workspaceId, memberToDelete.id);

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

    const columns = React.useMemo(() =>
        createTeamMemberColumns(
            isAdmin,
            handleViewMember,
            handleEditMember,
            handleDeleteMember
        ),
        [isAdmin, handleViewMember, handleEditMember, handleDeleteMember]
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
                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-primary text-primary-foreground">
                                        Active
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Edit Member Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Update Member Role</DialogTitle>
                    </DialogHeader>
                    {memberToEdit && (
                        <div className="space-y-6 py-4">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                    <AvatarImage src={memberToEdit.user?.image || ""} />
                                    <AvatarFallback>{memberToEdit.user?.name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="text-sm font-medium">{memberToEdit.user?.name}</p>
                                    <p className="text-xs text-muted-foreground">{memberToEdit.user?.email}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Role</label>
                                <Select value={newRole} onValueChange={setNewRole}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ADMIN">Admin</SelectItem>
                                        <SelectItem value="MEMBER">Member</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[0.8rem] text-muted-foreground">
                                    Admins can invite and remove members, and edit workspace settings.
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isUpdating}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditConfirm} disabled={isUpdating || newRole === memberToEdit?.workspaceRole}>
                            {isUpdating ? "Updating..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
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
