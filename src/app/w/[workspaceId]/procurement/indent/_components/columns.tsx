"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconDots, IconFileText, IconEdit, IconTrash } from "@tabler/icons-react";

// Flatten indent items for table display
export type IndentItemRow = {
    id: string; // item id
    indentId: string;
    indentKey: string;
    indentName: string;
    materialId: string;
    materialName: string;
    projectName: string;
    taskName: string | null;
    assigneeName: string | null;
    assigneeImage: string | null;
    quantity: number;
    unit: string | null;
    vendorName: string | null;
    estimatedPrice: number | null;
    expectedDelivery: Date | null;
    status: string;
};

export const getColumns = (userRole: string): ColumnDef<IndentItemRow>[] => [
    {
        id: "select",
        header: ({ table }) => (
            <Checkbox
                checked={table.getIsAllPageRowsSelected()}
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all"
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"
            />
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: "materialName",
        header: "Material",
        cell: ({ row }) => (
            <div className="font-medium max-w-[200px] truncate" title={row.getValue("materialName")}>
                {row.getValue("materialName")}
            </div>
        ),
    },
    {
        accessorKey: "indentKey",
        header: "Indent ID",
        cell: ({ row }) => (
            <div className="flex flex-col gap-0.5">
                <span className="font-mono text-xs">{row.getValue("indentKey")}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={row.original.indentName}>
                    {row.original.indentName}
                </span>
            </div>
        ),
    },
    {
        header: "Project / Task",
        cell: ({ row }) => (
            <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm">{row.original.projectName}</span>
                {row.original.taskName ? (
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={row.original.taskName}>
                        {row.original.taskName}
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                )}
            </div>
        ),
    },
    {
        accessorKey: "assigneeName",
        header: "Assignee",
        cell: ({ row }) => {
            const assigneeName = row.getValue("assigneeName") as string | null;
            const assigneeImage = row.original.assigneeImage;

            if (!assigneeName) {
                return <span className="text-xs text-muted-foreground">Unassigned</span>;
            }

            const initials = assigneeName
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

            return (
                <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                        <AvatarImage src={assigneeImage || undefined} alt={assigneeName} />
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                </div>
            );
        },
    },
    {
        accessorKey: "quantity",
        header: "Quantity",
        cell: ({ row }) => (
            <span className="font-medium">
                {row.getValue("quantity")} {row.original.unit || "units"}
            </span>
        ),
    },
    {
        accessorKey: "vendorName",
        header: "Vendor",
        cell: ({ row }) => {
            const vendor = row.getValue("vendorName") as string | null;
            return vendor ? (
                <span className="text-sm">{vendor}</span>
            ) : (
                <span className="text-xs text-muted-foreground">Searching for vendor...</span>
            );
        },
    },
    {
        accessorKey: "estimatedPrice",
        header: "Price",
        cell: ({ row }) => {
            const vendor = row.original.vendorName;
            const price = row.getValue("estimatedPrice") as number | null;

            // Show searching message if no vendor is selected
            if (!vendor) {
                return <span className="text-xs text-muted-foreground italic">Waiting for vendor...</span>;
            }

            return price ? (
                <span className="font-medium">₹{price.toFixed(2)}</span>
            ) : (
                <span className="text-xs text-muted-foreground">-</span>
            );
        },
    },
    {
        accessorKey: "expectedDelivery",
        header: "Expected Delivery",
        cell: ({ row }) => {
            const date = row.getValue("expectedDelivery") as Date | null;
            return date ? (
                <span className="text-sm">{format(new Date(date), "MMM d, yyyy")}</span>
            ) : (
                <span className="text-xs text-muted-foreground">-</span>
            );
        },
    },
    {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
            const { materialName, quantity, vendorName, estimatedPrice, status } = row.original;

            // Check if all required fields are filled
            const isComplete = materialName && quantity > 0 && vendorName && estimatedPrice && estimatedPrice > 0;
            const isApproved = status === "APPROVED";
            const canCreatePO = isComplete && isApproved;

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <IconDots className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            disabled={!canCreatePO}
                            onClick={() => {
                                // TODO: Implement Create PO functionality
                                console.log("Create PO for:", row.original);
                            }}
                        >
                            <IconFileText className="mr-2 h-4 w-4" />
                            Create PO
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                // TODO: Implement Edit functionality
                                console.log("Edit indent item:", row.original);
                            }}
                        >
                            <IconEdit className="mr-2 h-4 w-4" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                                // TODO: Implement Delete functionality
                                console.log("Delete indent item:", row.original);
                            }}
                        >
                            <IconTrash className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        },
    },
];
