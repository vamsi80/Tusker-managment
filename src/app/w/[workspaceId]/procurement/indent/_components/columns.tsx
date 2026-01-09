"use client";

import { ColumnDef } from "@tanstack/react-table";
import { IndentRequestWithRelations } from "@/data/procurement/get-indent-requests";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { IndentStatus } from "@/generated/prisma";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IndentDetailsDialog } from "./indent-details-dialog";

export const getColumns = (userRole: string): ColumnDef<IndentRequestWithRelations>[] => [
    {
        accessorKey: "key",
        header: "Indent ID",
        cell: ({ row }) => <span className="font-mono text-xs">{row.getValue("key")}</span>,
        enableSorting: true,
        enableHiding: false,
    },
    {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
            <IndentDetailsDialog
                indent={row.original}
                userRole={userRole}
                trigger={
                    <div className="font-medium max-w-[300px] truncate cursor-pointer hover:underline hover:text-primary transition-colors" title={row.getValue("name")}>
                        {row.getValue("name")}
                    </div>
                }
            />
        ),
    },
    {
        header: "Project / Task",
        cell: ({ row }) => (
            <div className="flex flex-col gap-1">
                <span className="font-medium text-sm">{row.original.project.name}</span>
                {row.original.task ? (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={row.original.task.name}>
                        {row.original.task.name}
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                )}
            </div>
        ),
    },
    {
        header: "Items",
        cell: ({ row }) => (
            <span className="text-sm font-medium">
                {row.original.items.length}
            </span>
        ),
    },
    {
        header: "Requested By",
        cell: ({ row }) => {
            // Need to cast or check if requestor exists (it should per schema/query)
            const user = (row.original as any).requestor?.user;
            return user ? (
                <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={user.image || undefined} />
                        <AvatarFallback className="text-[10px]">
                            {user.name?.charAt(0) || "U"}
                        </AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate max-w-[150px]">{user.name}</span>
                </div>
            ) : (
                <span className="text-muted-foreground text-xs">-</span>
            );
        },
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.getValue("status") as IndentStatus;
            let variant: "default" | "secondary" | "destructive" | "outline" = "outline";

            switch (status) {
                case "APPROVED":
                    variant = "default"; // green usually but default is primary
                    break;
                case "REJECTED":
                    variant = "destructive";
                    break;
                case "UNDER_REVIEW":
                    variant = "secondary";
                    break;
                default:
                    variant = "outline";
            }

            return <Badge variant={variant}>{status.replace("_", " ")}</Badge>;
        },
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id));
        },
    },
    {
        accessorKey: "createdAt",
        header: "Created At",
        cell: ({ row }) => (
            <span className="text-muted-foreground text-xs">
                {format(new Date(row.getValue("createdAt")), "MMM d, yyyy")}
            </span>
        ),
    },
];
