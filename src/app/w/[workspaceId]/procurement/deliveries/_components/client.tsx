'use client';

import { useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { DeliveryItemColumns, DeliveryItemRow } from './columns';

interface DeliveriesClientPageProps {
    data: any[]; // PurchaseOrder[]
    userRole: string;
    workspaceId: string;
}

export function DeliveriesClientPage({
    data,
    userRole,
    workspaceId,
}: DeliveriesClientPageProps) {
    // Flatten PO items for table display
    const flattenedData: DeliveryItemRow[] = data.flatMap((po) =>
        (po.items || []).map((item: any) => ({
            id: item.id,
            poId: po.id,
            poNumber: po.poNumber,
            poDate: po.createdAt,
            poStatus: po.status,
            materialId: item.materialId,
            materialName: item.material?.name || 'Unknown',
            quantity: item.orderedQuantity,
            unit: item.unit?.abbreviation || '',
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
            vendorName: po.vendor?.name || 'Unknown',
            projectName: po.project?.name || 'Unknown',
            deliveryStatus: item.deliveryStatus || 'PENDING',
            deliveredQuantity: item.deliveredQuantity || 0,
            expectedDelivery: po.expectedDeliveryDate,
        }))
    );

    const columns = DeliveryItemColumns();

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Deliveries</h2>
                    <p className="text-muted-foreground">
                        Track and manage purchase order deliveries
                    </p>
                </div>
            </div>

            <div className="h-full flex-1 flex-col space-y-8 md:flex">
                <DataTable
                    columns={columns}
                    data={flattenedData}
                    searchKey="materialName"
                    searchPlaceholder="Search materials..."
                    filterFields={[
                        {
                            label: 'PO Status',
                            value: 'poStatus',
                            options: [
                                { label: 'Draft', value: 'DRAFT' },
                                { label: 'Pending', value: 'PENDING' },
                                { label: 'Approved', value: 'APPROVED' },
                                { label: 'Completed', value: 'COMPLETED' },
                                { label: 'Cancelled', value: 'CANCELLED' },
                            ],
                        },
                        {
                            label: 'Delivery Status',
                            value: 'deliveryStatus',
                            options: [
                                { label: 'Pending', value: 'PENDING' },
                                { label: 'Partial', value: 'PARTIAL' },
                                { label: 'Delivered', value: 'DELIVERED' },
                            ],
                        },
                    ]}
                    filterDisplay="menu"
                />
            </div>
        </div>
    );
}
