"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconDots, IconEdit, IconTrash } from "@tabler/icons-react";

export type IndentItemRow = {
    id: string;
    indentId: string;
    indentKey: string;
    indentName: string;
    materialId: string;
    materialName: string;
    projectName: string;
    taskName: string | null;
    assigneeName: string | null;
    assigneeImage: string | null;
    requestedByName: string | null;
    requestedByImage: string | null;
    quantity: number;
    unit: string | null;
    vendorName: string | null;
    estimatedPrice: number | null;
    startDate: Date;
    expectedDelivery: Date | null;
    status: string;
    materialsCount: number;
    requiresVendor: boolean;
};

export const IndentItemColumns = (
    onEdit: (row: IndentItemRow) => void,
    onDelete: (row: IndentItemRow) => void
): ColumnDef<IndentItemRow>[] => [
        {
            accessorKey: "indentName",
            id: "indentName",
            header: "Indent Name",
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            cell: ({ row }) => (
                <div className="flex flex-col gap-0 min-w-[200px] max-w-[200px]">
                    <span className="font-medium text-sm truncate" title={row.original.indentName}>
                        {row.original.indentName}
                    </span>
                    <span className="text-xs text-muted-foreground truncate" title={row.original.indentKey}>
                        ID: {row.original.indentKey}
                    </span>
                </div>
            ),
        },
        {
            accessorKey: "projectName",
            id: "projectName",
            header: "Project / Task",
            size: 200,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm truncate" title={row.original.projectName}>
                        {row.original.projectName}
                    </span>
                    {row.original.taskName ? (
                        <span className="text-xs text-muted-foreground truncate" title={row.original.taskName}>
                            {row.original.taskName}
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                    )}
                </div>
            ),
        },
        {
            accessorKey: "materialsCount",
            header: "Materials",
            size: 100,
            cell: ({ row }) => (
                <div className="flex items-center justify-center">
                    <span className="font-medium text-sm">
                        {row.original.materialsCount}
                    </span>
                </div>
            ),
        },
        {
            accessorKey: "requiresVendor",
            header: "Vendor",
            size: 130,
            filterFn: (row, id, value) => {
                const requiresVendor = row.original.requiresVendor;
                return value.includes(String(requiresVendor));
            },
            cell: ({ row }) => {
                const requiresVendor = row.original.requiresVendor;
                return (
                    <Badge
                        variant={requiresVendor ? "default" : "secondary"}
                        className={requiresVendor ? "bg-blue-100 text-blue-800 border-blue-200" : ""}
                    >
                        {requiresVendor ? "Required" : "Not Required"}
                    </Badge>
                );
            },
        },
        {
            accessorKey: "startDate",
            header: "Start Date",
            size: 150,
            cell: ({ row }) => {
                const date = row.getValue("startDate") as Date | null;
                return date ? (
                    <span className="text-sm">{format(new Date(date), "MMM d, yyyy")}</span>
                ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                );
            },
        },
        {
            accessorKey: "expectedDelivery",
            header: "Expected Delivery",
            size: 150,
            filterFn: (row, id, value) => {
                const date = row.getValue(id) as Date | null;
                if (!date) return false;

                const deliveryDate = new Date(date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const oneWeekFromNow = new Date(today);
                oneWeekFromNow.setDate(today.getDate() + 7);

                const oneMonthFromNow = new Date(today);
                oneMonthFromNow.setMonth(today.getMonth() + 1);

                return value.some((filterValue: string) => {
                    if (filterValue === "overdue") {
                        return deliveryDate < today;
                    } else if (filterValue === "this_week") {
                        return deliveryDate >= today && deliveryDate <= oneWeekFromNow;
                    } else if (filterValue === "this_month") {
                        return deliveryDate >= today && deliveryDate <= oneMonthFromNow;
                    } else if (filterValue === "all") {
                        return true;
                    }
                    return false;
                });
            },
            cell: ({ row }) => {
                const date = row.getValue("expectedDelivery") as Date | null;
                if (!date) {
                    return <span className="text-xs text-muted-foreground">-</span>;
                }

                const deliveryDate = new Date(date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isOverdue = deliveryDate < today;

                return (
                    <span className={`text-sm ${isOverdue ? "text-red-600 font-semibold" : ""}`}>
                        {format(deliveryDate, "MMM d, yyyy")}
                    </span>
                );
            },
        },
        {
            accessorKey: "assigneeName",
            id: "assigneeName",
            header: "Assignee",
            size: 120,
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
                        <span className="text-sm truncate" title={assigneeName}>{assigneeName}</span>
                    </div>
                );
            },
        },
        {
            accessorKey: "requestedByName",
            id: "requestedByName",
            header: "Requested By",
            size: 150,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
            cell: ({ row }) => {
                const requestedByName = row.getValue("requestedByName") as string | null;
                const requestedByImage = row.original.requestedByImage;

                if (!requestedByName) {
                    return <span className="text-xs text-muted-foreground">-</span>;
                }

                const initials = requestedByName
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                return (
                    <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                            <AvatarImage src={requestedByImage || undefined} alt={requestedByName} />
                            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate" title={requestedByName}>{requestedByName}</span>
                    </div>
                );
            },
        },
        {
            id: "actions",
            header: "",
            size: 60,
            meta: {
                sticky: "right",
            },
            cell: ({ row }) => {
                return (
                    <div className="flex justify-end pr-2">
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
                    </div>
                );
            },
        },
    ];
