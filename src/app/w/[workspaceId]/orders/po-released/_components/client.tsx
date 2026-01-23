'use client';

import { useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { DeliveryColumns, DeliveryRow } from './columns';
import { PurchaseOrderWithRelations } from '@/data/procurement';
import { PODetailsSheet } from './po-details-sheet';

interface DeliveriesClientPageProps {
    data: PurchaseOrderWithRelations[];
    userRole: string;
    workspaceId: string;
}

export function DeliveriesClientPage({
    data,
    userRole,
    workspaceId,
}: DeliveriesClientPageProps) {
    const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    const handlePOClick = (poId: string) => {
        setSelectedPOId(poId);
        setSheetOpen(true);
    };

    const tableData: DeliveryRow[] = data.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        poDate: po.createdAt,
        status: po.status,
        vendorName: po.vendor?.name || 'Unknown',
        projectName: po.project?.name || 'Unknown',
        itemCount: po.items?.length || 0,
        totalAmount: po.totalAmount,
        expectedDelivery: po.deliveryingAt,
        deliveryAddress: [
            po.deliveryAddressLine1,
            po.deliveryAddressLine2,
            po.deliveryCity,
            po.deliveryState,
            po.deliveryCountry,
            po.deliveryPincode,
        ].filter(Boolean).join(', '),
    }));

    const columns = DeliveryColumns(workspaceId, handlePOClick);

    return (
        <>
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
                        data={tableData}
                        searchKey="poNumber"
                        searchPlaceholder="Search by PO number..."
                        filterFields={[
                            {
                                label: 'Status',
                                value: 'status',
                                options: [
                                    { label: 'Draft', value: 'DRAFT' },
                                    { label: 'Pending', value: 'PENDING' },
                                    { label: 'Approved', value: 'APPROVED' },
                                    { label: 'Completed', value: 'COMPLETED' },
                                    { label: 'Cancelled', value: 'CANCELLED' },
                                ],
                            },
                        ]}
                        filterDisplay="menu"
                    />
                </div>
            </div>

            <PODetailsSheet
                poId={selectedPOId}
                open={sheetOpen}
                onOpenChange={setSheetOpen}
            />
        </>
    );
}
