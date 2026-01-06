"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
    createSelectColumn,
    createActionsColumn,
    createBadgeColumn,
} from "@/components/data-table/column-helpers";
import { IconEye, IconEdit, IconTrash } from "@tabler/icons-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WorkspaceMemberRow } from "@/data/workspace";

export function createTeamMemberColumns(
    isAdmin: boolean,
    onView: (member: WorkspaceMemberRow) => void,
    onEdit: (member: WorkspaceMemberRow) => void,
    onDelete: (member: WorkspaceMemberRow) => void
): ColumnDef<WorkspaceMemberRow>[] {
    const columns: ColumnDef<WorkspaceMemberRow>[] = [
        createSelectColumn<WorkspaceMemberRow>(),

        {
            accessorKey: "user.name",
            header: "Member",
            cell: ({ row }) => {
                const user = row.original.user;
                const name = user?.name || "";
                const email = user?.email;
                const image = user?.image || "";
                const initials = name.charAt(0).toUpperCase();

                return (
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={image} alt={name} />
                            <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="font-medium">{name}</span>
                            <span className="text-xs text-muted-foreground">{email}</span>
                        </div>
                    </div>
                );
            },
        },

        {
            accessorKey: "user.surname",
            header: "Surname",
            cell: ({ row }) => {
                const surname = row.original.user?.surname;
                return (
                    <div className="text-muted-foreground">
                        {surname || "—"}
                    </div>
                );
            },
        },

        {
            accessorKey: "workspaceRole",
            header: "Role",
            cell: ({ row }) => {
                const role = row.original.workspaceRole;
                return (
                    <div className="font-medium capitalize">
                        {role.toLowerCase().replace("_", " ")}
                    </div>
                );
            },
        },

        {
            accessorKey: "user.contactNumber",
            header: "Contact",
            cell: ({ row }) => {
                const contact = row.original.user?.contactNumber;
                return (
                    <div className="text-muted-foreground">
                        {contact || "—"}
                    </div>
                );
            },
        },

        {
            id: "status",
            header: "Status",
            cell: () => {
                return (
                    <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-primary text-primary-foreground">
                        Active
                    </div>
                );
            },
        },
    ];

    // Add actions column
    const actions: {
        label: string;
        onClick: (row: WorkspaceMemberRow) => void;
        icon?: React.ReactNode;
        variant?: "default" | "destructive";
    }[] = [
            {
                label: "View Details",
                onClick: onView,
                icon: <IconEye className="h-4 w-4" />,
            },
        ];

    if (isAdmin) {
        actions.push(
            {
                label: "Edit Member",
                onClick: onEdit,
                icon: <IconEdit className="h-4 w-4" />,
            },
            {
                label: "Remove Member",
                onClick: onDelete,
                icon: <IconTrash className="h-4 w-4" />,
                variant: "destructive",
            }
        );
    }

    columns.push(createActionsColumn<WorkspaceMemberRow>(actions));

    return columns;
}
