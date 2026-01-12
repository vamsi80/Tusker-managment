"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { ApprovedIndentItemWithRelations } from "@/data/procurement";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { CreateRfqDialog } from "./create-rfq-dialog";
import { Vendor } from "@/generated/prisma";

export const columns: ColumnDef<ApprovedIndentItemWithRelations>[] = [
    {
        id: "select",
        header: ({ table }) => (
            <Checkbox
                checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all"
                className="translate-y-[2px]"
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"
                className="translate-y-[2px]"
            />
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: "material.name",
        header: "Material",
        cell: ({ row }) => (
            <div className="font-medium">{row.original.material.name}</div>
        ),
    },
    {
        accessorKey: "quantity",
        header: "Quantity",
        cell: ({ row }) => {
            const unit = row.original.unit?.abbreviation || "";
            return (
                <div className="flex items-baseline gap-1">
                    <span className="font-medium">{row.original.quantity}</span>
                    <span className="text-muted-foreground text-xs">{unit}</span>
                </div>
            );
        },
    },
    {
        accessorKey: "indentDetails.project.name",
        header: "Project",
        cell: ({ row }) => (
            <div className="max-w-[200px] truncate" title={row.original.indentDetails.project.name}>
                {row.original.indentDetails.project.name}
            </div>
        ),
    },
    {
        accessorKey: "indentDetails.key",
        header: "Indent Ref",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.indentDetails.key}</span>,
    },
    {
        accessorKey: "indentDetails.expectedDelivery",
        header: "Needed By",
        cell: ({ row }) => {
            const date = row.original.indentDetails.expectedDelivery;
            return (
                <span className="text-muted-foreground text-xs">
                    {date ? format(new Date(date), "MMM d, yyyy") : "-"}
                </span>
            );
        }
    }
];

interface ApprovedItemsTableProps {
    data: ApprovedIndentItemWithRelations[];
    vendors: Vendor[];
    workspaceId: string;
}

export function ApprovedItemsTable({ data, vendors, workspaceId }: ApprovedItemsTableProps) {
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

    const selectedItems = data.filter((item) => rowSelection[item.id]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">Approved Items</h3>
                <CreateRfqDialog
                    items={selectedItems}
                    vendors={vendors}
                    workspaceId={workspaceId}
                    onClose={() => setRowSelection({})}
                />
            </div>
            <DataTable
                columns={columns}
                data={data}
                searchKey="material.name"
                searchPlaceholder="Search materials..."
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                getRowId={(row) => row.id}
            />
        </div>
    );
}
