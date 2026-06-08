"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, MoreVertical, Ban, CheckCircle, ExternalLink, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface VendorsTableProps {
    initialVendors: any[];
    workspaceId: string;
}

export function VendorsTable({ initialVendors, workspaceId }: VendorsTableProps) {
    const router = useRouter();
    const [vendors, setVendors] = useState(initialVendors);

    const refreshVendors = async () => {
        try {
            const res = await fetch(`/api/v1/procurement/vendors?w=${workspaceId}`, {
                credentials: "include",
            });
            const data = await res.json();
            if (data.success) setVendors(data.data);
        } catch {
            toast.error("Failed to refresh vendors");
        }
    };

    const handleToggleBlacklist = async (vendorId: string, currentStatus: string) => {
        const isBlacklisted = currentStatus === "BLACKLISTED";
        try {
            const res = await fetch(`/api/v1/procurement/vendors/${vendorId}?w=${workspaceId}`, {
                method: isBlacklisted ? "PATCH" : "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                ...(isBlacklisted ? { body: JSON.stringify({ status: "ACTIVE" }) } : {}),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(isBlacklisted ? "Vendor activated" : "Vendor blacklisted successfully");
                refreshVendors();
            } else {
                toast.error(data.error || "Operation failed");
            }
        } catch {
            toast.error("An error occurred. Please try again.");
        }
    };

    const locationOptions = Array.from(
        new Set(
            vendors
                .map((v) => [v.city, v.state].filter(Boolean).join(", "))
                .filter(Boolean)
        )
    ).map((loc) => ({ label: loc, value: loc }));

    const columns: ColumnDef<any>[] = [
        {
            accessorKey: "name",
            header: "Vendor Name",
            cell: ({ row }) => <span className="font-medium text-foreground">{row.getValue("name")}</span>,
        },
        { accessorKey: "companyName", header: "Company Name", cell: ({ row }) => row.getValue("companyName") || "-" },
        { accessorKey: "email", header: "Email", cell: ({ row }) => row.getValue("email") || "-" },
        { accessorKey: "phoneNumber", header: "Phone", cell: ({ row }) => row.getValue("phoneNumber") || "-" },
        {
            id: "location",
            accessorFn: (row) => [row.city, row.state].filter(Boolean).join(", ") || "",
            header: "Location",
            cell: ({ row }) => row.getValue("location") || "-",
            filterFn: (row, columnId, filterValue) => {
                if (!filterValue || filterValue.length === 0) return true;
                return filterValue.includes(row.getValue(columnId));
            },
        },
        { accessorKey: "contactPerson", header: "Contact Person", cell: ({ row }) => row.getValue("contactPerson") || "-" },
        {
            accessorKey: "gstNumber",
            header: "GSTIN",
            cell: ({ row }) => <span className="font-mono text-sm tracking-wide">{(row.getValue("gstNumber") as string) || "-"}</span>,
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                return (
                    <Badge
                        variant={status === "ACTIVE" ? "outline" : "destructive"}
                        className={
                            status === "ACTIVE"
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/15"
                                : "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/15"
                        }
                    >
                        {status}
                    </Badge>
                );
            },
            filterFn: (row, columnId, filterValue) => {
                if (!filterValue || filterValue.length === 0) return true;
                return filterValue.includes(row.getValue(columnId));
            },
        },
        {
            id: "actions",
            header: () => <div className="text-right">Actions</div>,
            cell: ({ row }) => {
                const vendor = row.original;
                return (
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => router.push(`/w/${workspaceId}/vendors/${vendor.id}`)}
                        >
                            Capabilities <ExternalLink className="size-3" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8">
                                    <MoreVertical className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => router.push(`/w/${workspaceId}/vendors/${vendor.id}/edit`)}>
                                    <Edit className="mr-2 size-4" /> Edit Vendor Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => handleToggleBlacklist(vendor.id, vendor.status)}
                                    className={vendor.status === "BLACKLISTED" ? "text-emerald-600" : "text-red-600"}
                                >
                                    {vendor.status === "BLACKLISTED" ? (
                                        <><CheckCircle className="mr-2 size-4" /> Activate Supplier</>
                                    ) : (
                                        <><Ban className="mr-2 size-4" /> Blacklist Supplier</>
                                    )}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-2xl font-normal leading-tight tracking-tighter md:text-2xl text-foreground">
                    Vendors
                </h1>
                <Button onClick={() => router.push(`/w/${workspaceId}/vendors/new`)} className="gap-2">
                    <Plus className="size-4" /> Onboard Vendor
                </Button>
            </div>
            <Card className="border-none shadow-sm bg-transparent">
                <CardContent className="p-0">
                    <DataTable
                        columns={columns}
                        data={vendors}
                        enableGlobalFilter={true}
                        searchPlaceholder="Search by name, company, GST, location..."
                        onRowClick={(row) => router.push(`/w/${workspaceId}/vendors/${row.id}`)}
                        filterFields={[
                            {
                                label: "Status",
                                value: "status",
                                options: [
                                    { label: "Active", value: "ACTIVE" },
                                    { label: "Blacklisted", value: "BLACKLISTED" },
                                ],
                            },
                            { label: "Location", value: "location", options: locationOptions },
                        ]}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
