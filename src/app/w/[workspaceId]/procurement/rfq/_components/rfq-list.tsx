"use client";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { RfqWithRelations } from "@/data/procurement/get-rfqs";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const columns: ColumnDef<RfqWithRelations>[] = [
    {
        accessorKey: "key",
        header: "RFQ Ref",
        cell: ({ row }) => (
            <Link
                href={`rfq/${row.original.id}`}
                className="font-medium text-primary hover:underline"
            >
                {row.original.key}
            </Link>
        )
    },
    {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => format(new Date(row.original.createdAt), "MMM d, yyyy")
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>
    },
    {
        accessorKey: "vendors",
        header: "Vendors",
        cell: ({ row }) => (
            <div className="flex flex-col">
                <span className="font-medium">{row.original.vendors.length} Vendors</span>
                <span className="text-xs text-muted-foreground">
                    {row.original._count.quotations} Quotes Received
                </span>
            </div>
        )
    },
    {
        id: "actions",
        cell: ({ row }) => (
            <Button asChild size="sm" variant="outline">
                <Link href={`rfq/${row.original.id}`}>Manage</Link>
            </Button>
        )
    }
];

export function RfqList({ data }: { data: RfqWithRelations[] }) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">Active RFQs</h3>
            </div>
            <DataTable columns={columns} data={data} searchKey="key" searchPlaceholder="Search RFQs..." />
        </div>
    );
}
