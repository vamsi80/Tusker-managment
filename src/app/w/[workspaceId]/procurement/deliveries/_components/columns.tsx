'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconPackage, IconTruck } from '@tabler/icons-react';
import { formatDate } from '@/components/task/gantt/utils';

export type DeliveryItemRow = {
    id: string;
    poId: string;
    poNumber: string;
    poDate: Date;
    poStatus: string;
    materialId: string;
    materialName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalAmount: number;
    vendorName: string;
    projectName: string;
    deliveryStatus: string;
    deliveredQuantity: number;
    expectedDelivery: Date | null;
};

const getStatusColor = (status: string) => {
    switch (status) {
        case 'DELIVERED':
            return 'default';
        case 'PARTIAL':
            return 'secondary';
        case 'PENDING':
            return 'outline';
        default:
            return 'outline';
    }
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
        default:
            return 'outline';
    }
};

export const DeliveryItemColumns = (): ColumnDef<DeliveryItemRow>[] => [
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
        accessorKey: 'materialName',
        header: 'Material',
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id));
        },
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <IconPackage className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{row.original.materialName}</span>
                    <span className="text-xs text-muted-foreground">
                        {row.original.unit}
                    </span>
                </div>
            </div>
        ),
    },
    {
        accessorKey: 'vendorName',
        header: 'Vendor',
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <IconTruck className="h-4 w-4 text-muted-foreground" />
                <span>{row.original.vendorName}</span>
            </div>
        ),
    },
    {
        accessorKey: 'projectName',
        header: 'Project',
    },
    {
        accessorKey: 'quantity',
        header: 'Ordered',
        cell: ({ row }) => (
            <div className="text-right font-medium">
                {row.original.quantity} {row.original.unit}
            </div>
        ),
    },
    {
        accessorKey: 'deliveredQuantity',
        header: 'Delivered',
        cell: ({ row }) => {
            const delivered = row.original.deliveredQuantity;
            const ordered = row.original.quantity;
            const percentage = ordered > 0 ? Math.round((delivered / ordered) * 100) : 0;

            return (
                <div className="flex flex-col gap-0.5">
                    <div className="text-right font-medium">
                        {delivered} / {ordered} {row.original.unit}
                    </div>
                    <div className="text-xs text-right text-muted-foreground">
                        {percentage}%
                    </div>
                </div>
            );
        },
    },
    {
        accessorKey: 'unitPrice',
        header: 'Unit Price',
        cell: ({ row }) => (
            <div className="text-right">
                ₹{row.original.unitPrice.toFixed(2)}
            </div>
        ),
    },
    {
        accessorKey: 'totalAmount',
        header: 'Total',
        cell: ({ row }) => (
            <div className="text-right font-semibold">
                ₹{row.original.totalAmount.toFixed(2)}
            </div>
        ),
    },
    {
        accessorKey: 'poStatus',
        header: 'PO Status',
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id));
        },
        cell: ({ row }) => (
            <Badge variant={getPOStatusColor(row.original.poStatus)}>
                {row.original.poStatus}
            </Badge>
        ),
    },
    {
        accessorKey: 'deliveryStatus',
        header: 'Delivery',
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id));
        },
        cell: ({ row }) => (
            <Badge variant={getStatusColor(row.original.deliveryStatus)}>
                {row.original.deliveryStatus}
            </Badge>
        ),
    },
    {
        accessorKey: 'expectedDelivery',
        header: 'Expected',
        cell: ({ row }) => {
            if (!row.original.expectedDelivery) return '-';
            return (
                <span className="text-sm">
                    {formatDate(row.original.expectedDelivery)}
                </span>
            );
        },
    },
    {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        // TODO: Open delivery dialog
                        console.log('Record delivery for:', row.original.id);
                    }}
                >
                    Record Delivery
                </Button>
            </div>
        ),
    },
];
