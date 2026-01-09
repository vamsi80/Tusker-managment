"use client";

import { ColumnDef } from "@tanstack/react-table";
import { IndentRequestWithRelations } from "@/data/procurement/get-indent-requests";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { IndentStatus } from "@/generated/prisma";

export const columns: ColumnDef<IndentRequestWithRelations>[] = [
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
            <div className="font-medium max-w-[300px] truncate" title={row.getValue("name")}>
                {row.getValue("name")}
            </div>
        ),
    },
    {
        accessorKey: "project.name",
        header: "Project",
        cell: ({ row }) => <Badge variant="outline">{row.original.project.name}</Badge>,
    },
    {
        accessorKey: "task.name",
        header: "Task",
        cell: ({ row }) => {
            const task = row.original.task;
            return task ? (
                <div className="flex flex-col">
                    <span className="text-sm font-medium truncate max-w-[200px]">{task.name}</span>
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
