'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconEye, IconDownload, IconPackage, IconDots } from '@tabler/icons-react';
import { formatDate } from '@/components/task/gantt/utils';

export type DeliveryRow = {
    id: string;
    poNumber: string;
    poDate: Date;
    status: string;
    vendorName: string;
    projectName: string;
    itemCount: number;
    totalAmount: number;
    expectedDelivery: Date | null;
    deliveryAddress: string;
};

const getPOStatusColor = (status: string) => {
    switch (status) {
        case 'APPROVED':
            return 'default';
        case 'PENDING':
            return 'secondary';
        case 'COMPLETED':
            return 'default';
        case 'CANCELLED':
            return 'destructive';
        case 'DRAFT':
            return 'outline';
        default:
            return 'outline';
    }
};

export const DeliveryColumns = (workspaceId: string): ColumnDef<DeliveryRow>[] => [
    {
        accessorKey: 'poNumber',
        header: 'PO Number',
        cell: ({ row }) => (
            <div className="flex flex-col gap-0.5">
                <span className="font-medium">{row.original.poNumber}</span>
                <span className="text-xs text-muted-foreground">
                    {formatDate(row.original.poDate)}
                </span>
            </div>
        ),
    },
    {
        accessorKey: 'vendorName',
        header: 'Vendor',
        cell: ({ row }) => (
            <div className="font-medium">
                {row.original.vendorName}
            </div>
        ),
    },
    {
        accessorKey: 'projectName',
        header: 'Project',
    },
    {
        accessorKey: 'itemCount',
        header: 'Items',
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <IconPackage className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{row.original.itemCount}</span>
            </div>
        ),
    },
    {
        accessorKey: 'totalAmount',
        header: 'Total Amount',
        cell: ({ row }) => (
            <div className="font-semibold">
                ₹{row.original.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
        ),
    },
    {
        accessorKey: 'expectedDelivery',
        header: 'Expected Delivery',
        cell: ({ row }) => {
            if (!row.original.expectedDelivery) return '-';
            const deliveryDate = new Date(row.original.expectedDelivery);
            const today = new Date();
            const isOverdue = deliveryDate < today;

            return (
                <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                    {formatDate(row.original.expectedDelivery)}
                </span>
            );
        },
    },
    {
        accessorKey: 'status',
        header: 'Status',
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id));
        },
        cell: ({ row }) => (
            <Badge variant={getPOStatusColor(row.original.status)}>
                {row.original.status}
            </Badge>
        ),
    },
    {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                        <IconDots className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => {
                            window.location.href = `/w/${workspaceId}/procurement/po/${row.original.id}`;
                        }}
                    >
                        <IconEye className="h-4 w-4 mr-2" />
                        View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            // TODO: Implement PDF download
                            console.log('Download PO:', row.original.poNumber);
                        }}
                    >
                        <IconDownload className="h-4 w-4 mr-2" />
                        Download PDF
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        ),
    },
];
