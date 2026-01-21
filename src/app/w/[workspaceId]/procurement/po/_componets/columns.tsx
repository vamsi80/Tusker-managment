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
import { Badge } from "@/components/ui/badge";

// Flatten indent items for table display
export type POItemRow = {
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
    unitId: string | null; // Added for PO creation
    unit: string | null;
    vendorId: string | null; // Added for PO creation
    vendorName: string | null;
    estimatedPrice: number | null;
    expectedDelivery: Date | null;
    status: string;
    hasPO: boolean;
    poNumber?: string;
    poStatus?: string;
};

export const POItemColumns = (
    onEdit: (row: POItemRow) => void,
    onDelete: (row: POItemRow) => void
): ColumnDef<POItemRow>[] => [
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
            id: "materialName",
            header: "Material",
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },

            cell: ({ row }) => (
                <div className="flex flex-col gap-0 min-w-[200px] max-w-[200px]">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate" title={row.getValue("materialName")}>
                            {row.getValue("materialName")}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal text-muted-foreground whitespace-nowrap">
                            {row.original.poNumber}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground truncate" title={row.original.indentName}>
                            {row.original.indentName}
                        </span>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: "indentName",
            id: "indentName",
            header: "Indent Name",
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5 max-w-[150px]">
                    <span className="font-medium text-sm truncate" title={row.original.indentName}>
                        {row.original.indentName}
                    </span>
                    <span className="text-xs text-muted-foreground truncate" title={row.original.indentKey}>
                        {row.original.indentKey}
                    </span>
                </div>
            ),
        },
        {
            accessorKey: "projectName",
            id: "projectName",
            header: "Project / Task",
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5 max-w-[120px]">
                    <span className="font-medium text-sm truncate" title={row.original.projectName}>{row.original.projectName}</span>
                    {row.original.taskName ? (
                        <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={row.original.taskName}>
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
            id: "assigneeName",
            header: "Assignee",
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
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
            header: "QTY",
            cell: ({ row }) => (
                <span className="font-medium">
                    {row.getValue("quantity")} {row.original.unit || "units"}
                </span>
            ),
        },
        {
            accessorKey: "vendorName",
            id: "vendorName",
            header: "Vendor",
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            cell: ({ row }) => {
                const vendor = row.getValue("vendorName") as string | null;
                return vendor ? (
                    <div className="max-w-[90px] truncate" title={vendor}>
                        <span className="text-sm">{vendor}</span>
                    </div>
                ) : (
                    <div className="text-xs text-muted-foreground max-w-[90px] truncate italic" title="Waiting for vendor">Not Found</div>
                );
            },
        },
        {
            accessorKey: "estimatedPrice",
            header: "Price / Piece",
            cell: ({ row }) => {
                const vendor = row.original.vendorName;
                const price = row.getValue("estimatedPrice") as number | null;

                if (!vendor) {
                    return <div className="text-xs text-muted-foreground italic max-w-[90px] truncate" title="Waiting for vendor">Not Found</div>;
                }

                return price ? (
                    <div className="flex flex-col">
                        <span className="font-medium">₹{price.toFixed(2)}</span>
                        <span className="text-[10px] text-muted-foreground">per {row.original.unit || "piece"}</span>
                    </div>
                ) : (
                    <span className="text-xs text-muted-foreground max-w-[90px] truncate">-</span>
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
            accessorKey: "status",
            id: "status",
            header: "Status",
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            cell: ({ row }) => {
                const status = row.getValue("status") as string;

                let colorClass = "bg-gray-100 text-gray-800 border-gray-200";

                switch (status) {
                    case "APPROVED":
                        colorClass = "bg-green-100 text-green-800 border-green-200";
                        break;
                    case "PENDING":
                        colorClass = "bg-yellow-100 text-yellow-800 border-yellow-200";
                        break;
                    case "REJECTED":
                        colorClass = "bg-red-100 text-red-800 border-red-200";
                        break;
                    case "QUANTITY_APPROVED":
                        colorClass = "bg-blue-100 text-blue-800 border-blue-200";
                        break;
                    case "VENDOR_PENDING":
                        colorClass = "bg-orange-100 text-orange-800 border-orange-200";
                        break;
                }

                return (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap ${colorClass}`}>
                        {status.replace(/_/g, " ")}
                    </span>
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
                                onClick={() => onEdit(row.original)}
                            >
                                <IconEdit className="mr-2 h-4 w-4" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => onDelete(row.original)}
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
