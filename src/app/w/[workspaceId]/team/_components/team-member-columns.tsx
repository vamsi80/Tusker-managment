"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
    // createSelectColumn,
    createActionsColumn,
    DataTableCellAction,
} from "@/components/data-table/column-helpers";
import { Eye, Edit, Trash, Mail } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WorkspaceMemberRow } from "@/data/workspace";
import { cn } from "@/lib/utils";

export function createTeamMemberColumns(
    isAdmin: boolean,
    onView: (member: WorkspaceMemberRow) => void,
    onEdit: (member: WorkspaceMemberRow) => void,
    onDelete: (member: WorkspaceMemberRow) => void,
    onResend: (member: WorkspaceMemberRow) => void
): ColumnDef<WorkspaceMemberRow>[] {
    const columns: ColumnDef<WorkspaceMemberRow>[] = [
        // createSelectColumn<WorkspaceMemberRow>(),

        {
            id: "memberName",
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
            accessorKey: "designation",
            header: "Designation",
            cell: ({ row }) => {
                const designation = row.original.designation;
                return (
                    <div className="text-muted-foreground font-medium">
                        {designation || "—"}
                    </div>
                );
            },
        },

        {
            id: "reportedTo",
            header: "Reported To",
            cell: ({ row }) => {
                const manager = row.original.reportTo;
                const managerName = manager
                    ? `${manager.user.surname || manager.user.name || ""}`.trim()
                    : "—";
                return (
                    <div className="text-muted-foreground italic">
                        {managerName}
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
            accessorKey: "user.phoneNumber",
            header: "Phone",
            cell: ({ row }) => {
                const phone = row.original.user?.phoneNumber;
                return (
                    <div className="text-muted-foreground">
                        {phone || "—"}
                    </div>
                );
            },
        },

        {
            id: "status",
            header: "Status",
            cell: ({ row }) => {
                const user = row.original.user;
                const isVerified = user?.emailVerified || (user?._count?.accounts ?? 0) > 0;

                return (
                    <div className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        isVerified
                            ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                            : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                    )}>
                        {isVerified ? "Verified" : "Pending"}
                    </div>
                );
            },
        },
    ];

    // Add actions column
    const actions: DataTableCellAction<WorkspaceMemberRow>[] = [
        {
            label: "View Details",
            onClick: onView,
            icon: <Eye className="h-4 w-4" />,
        },
    ];

    if (isAdmin) {
        actions.push(
            {
                label: "Edit Member",
                onClick: onEdit,
                icon: <Edit className="h-4 w-4" />,
            },
            {
                label: "Remove Member",
                onClick: onDelete,
                icon: <Trash className="h-4 w-4" />,
                variant: "destructive",
            }
        );

        // Add Resend Invitation if not verified
        columns.forEach(col => {
            if (col.id === "actions") {
                // This is handled by creating the actions array below
            }
        });
    }

    // Dynamic actions based on member state
    if (isAdmin) {
        actions.push({
            label: "Resend Invitation",
            onClick: onResend,
            icon: <Mail className="h-4 w-4" />,
            // Only show if not verified
            hidden: (row: WorkspaceMemberRow) => {
                const user = row.user;
                const isVerified = user?.emailVerified || (user?._count?.accounts ?? 0) > 0;
                return !!isVerified;
            }
        });
    }

    const actionsColumn = createActionsColumn<WorkspaceMemberRow>(actions);

    // Add sticky styling using the meta property
    actionsColumn.meta = {
        className: "sticky right-0 bg-background z-10 border-l shadow-sm w-[50px] p-0"
    };

    columns.push(actionsColumn);

    return columns;
}
