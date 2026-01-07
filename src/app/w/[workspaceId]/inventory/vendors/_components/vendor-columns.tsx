"use client";

import { ColumnDef } from "@tanstack/react-table";
import { VendorRow } from "@/data/inventory/vendors";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconDots, IconEdit, IconTrash, IconEye } from "@tabler/icons-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const createVendorColumns = (
    onView?: (vendor: VendorRow) => void,
    onEdit?: (vendor: VendorRow) => void,
    onDelete?: (vendor: VendorRow) => void
): ColumnDef<VendorRow>[] => [
        {
            accessorKey: "name",
            header: "Name",
            cell: ({ row }) => {
                return (
                    <div className="flex flex-col">
                        <span className="font-medium">{row.getValue("name")}</span>
                        {row.original.email && (
                            <span className="text-xs text-muted-foreground">{row.original.email}</span>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: "contactPerson",
            header: "Contact Person",
            cell: ({ row }) => {
                const person = row.getValue("contactPerson") as string | null;
                return (
                    <div className="text-sm">
                        {person ? (
                            <span className="text-foreground">{person}</span>
                        ) : (
                            <span className="text-muted-foreground italic">--</span>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: "contactNumber",
            header: "Contact #",
            cell: ({ row }) => {
                const number = row.getValue("contactNumber") as string | null;
                return (
                    <div className="text-sm">
                        {number ? (
                            <span className="font-mono text-xs">{number}</span>
                        ) : (
                            <span className="text-muted-foreground italic">--</span>
                        )}
                    </div>
                );
            },
        },

        {
            accessorKey: "companyName",
            header: "Company Name",
            filterFn: (row, id, value: string[]) => {
                return value.includes(row.getValue(id) as string);
            },
            cell: ({ row }) => {
                const company = row.getValue("companyName") as string | null;
                return (
                    <div className="text-sm">
                        {company || "--"}
                    </div>
                );
            },
        },

        {
            accessorKey: "materials",
            header: "Materials Supplied",
            filterFn: (row, id, value: string[]) => {
                const rowValue = row.getValue(id) as { name: string }[];
                if (!rowValue) return false;
                return rowValue.some((m) => value.includes(m.name));
            },
            cell: ({ row }) => {
                const materials = row.original.materials || [];
                return (
                    <div className="flex flex-wrap gap-1 max-w-[250px]">
                        {materials.length > 0 ? (
                            materials.slice(0, 1).map((m: { name: string }) => (
                                <Badge key={m.name} variant="secondary" className="text-[10px] px-1 py-0 h-5">
                                    {m.name}
                                </Badge>
                            ))
                        ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                        {materials.length > 1 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">
                                +{materials.length - 1}
                            </Badge>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: "createdAt",
            header: "Added On",
            cell: ({ row }) => {
                return <div className="text-xs text-muted-foreground">{format(new Date(row.getValue("createdAt")), "MMM d, yyyy")}</div>;
            },
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const vendor = row.original;

                return (
                    <div className="flex justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <IconDots className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => onView?.(vendor)}>
                                    <IconEye className="mr-2 h-4 w-4" />
                                    View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onEdit?.(vendor)}>
                                    <IconEdit className="mr-2 h-4 w-4" />
                                    Edit Vendor
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => onDelete?.(vendor)}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <IconTrash className="mr-2 h-4 w-4" />
                                    Delete Vendor
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ];
