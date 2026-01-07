"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
    // createSelectColumn,
    createActionsColumn,
} from "@/components/data-table/column-helpers"; // Assuming this is where it is based on team-member-columns.tsx
import { IconEye, IconEdit, IconTrash, IconCube } from "@tabler/icons-react";
import { MaterialRow } from "@/data/inventory/materials";

export function createMaterialColumns(
    isAdmin: boolean,
    onView: (material: MaterialRow) => void,
    onEdit: (material: MaterialRow) => void,
    onDelete: (material: MaterialRow) => void
): ColumnDef<MaterialRow>[] {
    const columns: ColumnDef<MaterialRow>[] = [
        // createSelectColumn<MaterialRow>(),

        {
            accessorKey: "name",
            header: "Material Name",
            cell: ({ row }) => {
                const name = row.original.name;
                const specs = row.original.specifications;

                return (
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <IconCube className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium">{name}</span>
                            {specs && (
                                <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                                    {specs}
                                </span>
                            )}
                        </div>
                    </div>
                );
            },
        },

        {
            accessorKey: "defaultUnit.name",
            header: "Unit",
            cell: ({ row }) => {
                const unitName = row.original.defaultUnit.name;
                const unitAbbr = row.original.defaultUnit.abbreviation;
                return (
                    <div className="flex items-center gap-2">
                        <span>{unitName}</span>
                        <span className="text-muted-foreground text-xs">({unitAbbr})</span>
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
        onClick: (row: MaterialRow) => void;
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
                label: "Edit Material",
                onClick: onEdit,
                icon: <IconEdit className="h-4 w-4" />,
            },
            {
                label: "Delete Material",
                onClick: onDelete,
                icon: <IconTrash className="h-4 w-4" />,
                variant: "destructive",
            }
        );
    }

    const actionsColumn = createActionsColumn<MaterialRow>(actions);

    // Add sticky styling using the meta property we enabled in DataTable
    actionsColumn.meta = {
        className: "sticky right-0 bg-background z-10 border-l shadow-sm w-[50px] p-0"
    };

    columns.push(actionsColumn);

    return columns;
}
