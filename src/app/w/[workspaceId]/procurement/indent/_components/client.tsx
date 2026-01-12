"use client";

import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { getColumns, IndentItemRow } from "./columns";
import { IndentRequestWithRelations } from "@/data/procurement/get-indent-requests";
import { IconCheck, IconX, IconClock, IconFileText } from "@tabler/icons-react";

interface IndentClientPageProps {
    data: IndentRequestWithRelations[];
    userRole: string;
    action?: React.ReactNode;
}

export function IndentClientPage({ data, userRole, action }: IndentClientPageProps) {
    const columns = useMemo(() => getColumns(userRole), [userRole]);

    // Flatten indent requests into individual item rows
    const flattenedData = useMemo<IndentItemRow[]>(() => {
        return data.flatMap((indent) =>
            indent.items.map((item) => ({
                id: item.id,
                indentId: indent.id,
                indentKey: indent.key,
                indentName: indent.name,
                materialId: item.material.id,
                materialName: item.material.name,
                projectName: indent.project.name,
                taskName: indent.task?.name || null,
                assigneeName: indent.assignee?.user?.name || null,
                quantity: item.quantity,
                unit: item.unit?.abbreviation || null,
                vendorName: item.vendor?.name || null,
                estimatedPrice: item.estimatedPrice || null,
                expectedDelivery: indent.expectedDelivery,
                status: indent.status,
            }))
        );
    }, [data]);

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Indent Items</h2>
                <div className="flex items-center space-x-2">
                    {action}
                </div>
            </div>
            <div className="h-full flex-1 flex-col space-y-8 md:flex">
                <DataTable
                    columns={columns}
                    data={flattenedData}
                    searchKey="materialName"
                    searchPlaceholder="Search materials..."
                />
            </div>
        </div>
    );
}
