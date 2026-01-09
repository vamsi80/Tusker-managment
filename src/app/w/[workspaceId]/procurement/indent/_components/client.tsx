"use client";

import { DataTable } from "@/components/data-table/data-table";
import { columns } from "./columns";
import { IndentRequestWithRelations } from "@/data/procurement/get-indent-requests";
import { IconCheck, IconX, IconClock, IconFileText } from "@tabler/icons-react";

interface IndentClientPageProps {
    data: IndentRequestWithRelations[];
}

export function IndentClientPage({ data }: IndentClientPageProps) {
    const filterFields = [
        {
            label: "Status",
            value: "status",
            options: [
                { label: "Requested", value: "REQUESTED", icon: IconFileText },
                { label: "Under Review", value: "UNDER_REVIEW", icon: IconClock },
                { label: "Approved", value: "APPROVED", icon: IconCheck },
                { label: "Rejected", value: "REJECTED", icon: IconX },
            ],
        },
    ];

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Indents</h2>
            </div>
            <div className="h-full flex-1 flex-col space-y-8 md:flex">
                <DataTable
                    columns={columns}
                    data={data}
                    searchKey="name"
                    searchPlaceholder="Search indents..."
                    filterFields={filterFields}
                />
            </div>
        </div>
    );
}
