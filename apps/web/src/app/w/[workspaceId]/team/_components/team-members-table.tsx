"use client";

import React, { useState, useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { createTeamMemberColumns } from "./team-member-columns";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { apiClient } from "@tusker/api-client";
import { type WorkspaceMemberRow } from "@tusker/core/types/workspace";
import { useWorkspaceLayout } from "../../_components/workspace-layout-context";
import { ViewMemberDialog } from "./view-member-dialog";
import { EditMemberDialog } from "./edit-member-dialog";
import { RemoveMemberDialog } from "./remove-member-dialog";

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
    departmentFilter?: {
        options: { id: string; name: string }[];
        value: string[];
        onChange: (value: string[]) => void;
    };
}

export function TeamMembers({ data, isAdmin, workspaceId, pagination, departmentFilter }: TeamMembersProps) {
    const router = useRouter();

    // Dialog states
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [memberToView, setMemberToView] = useState<WorkspaceMemberRow | null>(null);

    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [memberToEdit, setMemberToEdit] = useState<WorkspaceMemberRow | null>(null);

    const [memberToDelete, setMemberToDelete] = useState<WorkspaceMemberRow | null>(null);

    const { data: layoutData } = useWorkspaceLayout();

    const handleViewMember = useCallback((member: WorkspaceMemberRow) => {
        setMemberToView(member);
        setViewDialogOpen(true);
    }, []);

    const handleEditMember = useCallback((member: WorkspaceMemberRow) => {
        setMemberToEdit(member);
        setEditDialogOpen(true);
    }, []);

    const handleDeleteMember = useCallback((member: WorkspaceMemberRow) => {
        setMemberToDelete(member);
    }, []);

    const handleResetPassword = useCallback(async (member: WorkspaceMemberRow) => {
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

    // Headcount workload is management information — owners, admins and managers
    // only. Everyone else does not see the Tasks Assigned column at all.
    const canSeeWorkload =
        !!layoutData?.permissions?.isWorkspaceAdmin ||
        layoutData?.permissions?.workspaceRole === "MANAGER";

    const columns = useMemo(() =>
        createTeamMemberColumns(
            isAdmin,
            canSeeWorkload,
            handleViewMember,
            handleEditMember,
            handleDeleteMember,
            handleResetPassword
        ),
        [isAdmin, canSeeWorkload, handleViewMember, handleEditMember, handleDeleteMember, handleResetPassword]
    );

    return (
        <>
            <DataTable
                columns={columns}
                data={data}
                searchKey="memberName"
                searchPlaceholder="Search members..."
                filterFields={departmentFilter ? [{
                    label: "Department",
                    value: "department",
                    options: [
                        { label: "No department", value: "none" },
                        ...departmentFilter.options.map((d) => ({ label: d.name, value: d.id })),
                    ],
                }] : []}
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
                    if (departmentFilter) {
                        const deptFilter = filters.find(f => f.id === "department");
                        departmentFilter.onChange((deptFilter?.value as string[]) || []);
                    }
                }}
            />

            {/* View Member Dialog */}
            <ViewMemberDialog
                open={viewDialogOpen}
                onOpenChange={(open) => {
                    setViewDialogOpen(open);
                    if (!open) setMemberToView(null);
                }}
                workspaceId={workspaceId}
                member={memberToView}
            />

            {/* Edit Member Dialog */}
            <EditMemberDialog
                open={editDialogOpen}
                onOpenChange={(open) => {
                    setEditDialogOpen(open);
                    if (!open) setMemberToEdit(null);
                }}
                workspaceId={workspaceId}
                member={memberToEdit}
            />

            {/* Removal: hand their pending work over, then deactivate. */}
            {memberToDelete && (
                <RemoveMemberDialog
                    workspaceId={workspaceId}
                    member={memberToDelete}
                    onClose={() => setMemberToDelete(null)}
                    onDone={() => {
                        setMemberToDelete(null);
                        router.refresh();
                    }}
                />
            )}
        </>
    );
}
