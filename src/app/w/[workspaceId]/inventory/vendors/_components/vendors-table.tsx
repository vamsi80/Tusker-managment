"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { VendorRow } from "@/data/inventory/vendors";
import { createVendorColumns } from "./vendor-columns";
import { CreateVendorForm } from "./create-vendor-form";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface VendorsTableProps {
    data: VendorRow[];
    workspaceId: string;
    materials: { id: string; name: string }[];
}

export function VendorsTable({ data, workspaceId, materials }: VendorsTableProps) {
    const router = useRouter();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    // Handlers
    const handleView = (vendor: VendorRow) => {
        toast.info(`View vendor: ${vendor.name}`);
    };

    const handleEdit = (vendor: VendorRow) => {
        toast.info(`Edit vendor: ${vendor.name}`);
    };

    const handleDelete = (vendor: VendorRow) => {
        toast.info(`Delete vendor: ${vendor.name}`);
    };

    const columns = createVendorColumns(
        handleView,
        handleEdit,
        handleDelete
    );

    const filterFields = [
        {
            label: "Materials",
            value: "materials",
            options: materials.map((m) => ({
                label: m.name,
                value: m.name,
            })),
        },
    ];

    return (
        <>
            <DataTable
                columns={columns}
                data={data}
                searchKey="name"
                searchPlaceholder="Search vendors..."
                onRowClick={handleView}
                showPagination={true}
                showColumnToggle={true}
                pageSize={10}
                onAdd={() => setCreateDialogOpen(true)}
                addButtonLabel="Add Vendor"
                filterFields={filterFields}
            />

            <CreateVendorForm
                workspaceId={workspaceId}
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                hideTrigger={true}
                materials={materials}
            />
        </>
    );
}
