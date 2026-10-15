"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
    // createSelectColumn,
    createActionsColumn,
    DataTableCellAction,
} from "@/components/data-table/column-helpers";
import { Eye, Edit, Trash, Mail } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { type WorkspaceMemberRow } from "@tusker/core/types/workspace";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { badgeVariants } from "@/components/ui/badge";
import { StatusDot } from "@/components/shared/status-dot";

export function createTeamMemberColumns(
    isAdmin: boolean,
    /** Workload is management information: owners, admins and managers only. */
    canSeeWorkload: boolean,
    onView: (member: WorkspaceMemberRow) => void,
    onEdit: (member: WorkspaceMemberRow) => void,
    onDelete: (member: WorkspaceMemberRow) => void,
    onResend: (member: WorkspaceMemberRow) => void
): ColumnDef<WorkspaceMemberRow>[] {
    const tasksAssignedColumn: ColumnDef<WorkspaceMemberRow> = {
            id: "tasksAssigned",
            accessorKey: "openTaskCount",
            header: "Tasks Assigned",
            cell: ({ row }) => {
                const count = row.original.openTaskCount ?? 0;
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            // The row itself opens the member too; stop the cell
                            // from firing it a second time.
                            e.stopPropagation();
                            onView(row.original);
                        }}
                        title={`View ${row.original.name || "member"}'s tasks`}
                        className={cn(
                            badgeVariants({ variant: count === 0 ? "muted" : count < 5 ? "success" : count < 10 ? "warning" : "danger" }),
                            "cursor-pointer transition-all hover:ring-1 hover:ring-inset hover:ring-current"
                        )}
                    >
                        {count} {count === 1 ? "task" : "tasks"}
                    </button>
                );
            },
        };

    const columns: ColumnDef<WorkspaceMemberRow>[] = [
        // createSelectColumn<WorkspaceMemberRow>(),

        {
            id: "memberName",
            accessorKey: "name",
            header: "Member",
            cell: ({ row }) => {
                const name = row.original.name || "";
                const email = row.original.email;
                const initials = name.charAt(0).toUpperCase();

                return (
                    <div className="flex items-center gap-3">
                        <Avatar className="size-10">
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
            accessorKey: "surname",
            header: "Surname",
            cell: ({ row }) => (
                <div className="text-muted-foreground">{row.original.surname || "—"}</div>
            ),
        },
        {
            accessorKey: "employeeId",
            header: "Emp ID / DOB",
            cell: ({ row }) => {
                const { employeeId, dateOfBirth } = row.original;
                let dob = "—";
                try {
                    if (dateOfBirth) dob = format(new Date(dateOfBirth), "dd-MM-yyyy");
                } catch {}
                return (
                    <div className="flex flex-col">
                        <span className="font-medium"># {employeeId || "—"}</span>
                        <span className="text-xs text-muted-foreground">{dob}</span>
                    </div>
                );
            },
        },
        {
            // Keeps the "department" id: the Department filter targets it.
            id: "department",
            accessorKey: "departmentName",
            header: "Designation / Department",
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-medium">{row.original.designation || "—"}</span>
                    <span className="text-xs text-muted-foreground">{row.original.departmentName || "—"}</span>
                </div>
            ),
        },

        ...(canSeeWorkload ? [tasksAssignedColumn] : []),

        {
            id: "reportedTo",
            accessorKey: "reportToName",
            header: "Reported to / Role",
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-medium italic">{row.original.reportToName || "—"}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                        {row.original.workspaceRole.toLowerCase().replace("_", " ")}
                    </span>
                </div>
            ),
        },

        {
            accessorKey: "phoneNumber",
            header: "Phone",
            cell: ({ row }) => (
                <div className="text-muted-foreground">{row.original.phoneNumber || "—"}</div>
            ),
        },

        {
            id: "status",
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => {
                const status = row.original.status || "Pending";
                return <StatusDot tone={status === "Verified" ? "success" : "warning"} label={status} />;
            },
        },
    ];

    // Add actions column
    const actions: DataTableCellAction<WorkspaceMemberRow>[] = [
        {
            label: "View Details",
            onClick: onView,
            icon: <Eye className="size-4" />,
        },
    ];

    if (isAdmin) {
        actions.push(
            {
                label: "Edit Member",
                onClick: onEdit,
                icon: <Edit className="size-4" />,
            },
            {
                label: "Remove Member",
                onClick: onDelete,
                icon: <Trash className="size-4" />,
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
            label: "Reset Password",
            onClick: onResend,
            icon: <Mail className="size-4" />,
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
