"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Truck, MoreVertical, Ban, CheckCircle, ExternalLink, Edit } from "lucide-react";
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

export default function VendorsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVendors();
  }, [workspaceId]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/procurement/vendors?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setVendors(data.data);
      } else {
        toast.error(data.error || "Failed to load vendors");
      }
    } catch (error) {
      toast.error("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBlacklist = async (vendorId: string, currentStatus: string) => {
    const isBlacklisted = currentStatus === "BLACKLISTED";
    try {
      if (isBlacklisted) {
        const res = await fetch(`/api/v1/procurement/vendors/${vendorId}?w=${workspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE" }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Vendor activated");
          fetchVendors();
        } else {
          toast.error(data.error || "Failed to activate vendor");
        }
      } else {
        const res = await fetch(`/api/v1/procurement/vendors/${vendorId}?w=${workspaceId}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Vendor blacklisted successfully");
          fetchVendors();
        } else {
          toast.error(data.error || "Failed to blacklist vendor");
        }
      }
    } catch (error) {
      toast.error("An error occurred. Please try again.");
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "name",
      header: "Vendor Name",
      cell: ({ row }) => <span className="font-medium text-foreground">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "companyName",
      header: "Company Name",
      cell: ({ row }) => row.getValue("companyName") || "-",
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => row.getValue("email") || "-",
    },
    {
      accessorKey: "phoneNumber",
      header: "Phone",
      cell: ({ row }) => row.getValue("phoneNumber") || "-",
    },
    {
      id: "location",
      accessorFn: (row) => {
        const parts = [row.city, row.state].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : "";
      },
      header: "Location",
      cell: ({ row }) => row.getValue("location") || "-",
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        const val = row.getValue(columnId) as string;
        return filterValue.includes(val);
      },
    },
    {
      accessorKey: "contactPerson",
      header: "Contact Person",
      cell: ({ row }) => row.getValue("contactPerson") || "-",
    },
    {
      accessorKey: "gstNumber",
      header: "GSTIN",
      cell: ({ row }) => {
        const val = row.getValue("gstNumber") as string;
        return <span className="font-mono text-sm tracking-wide">{val || "-"}</span>;
      },
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
        const val = row.getValue(columnId) as string;
        return filterValue.includes(val);
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
                <DropdownMenuItem
                  onClick={() => router.push(`/w/${workspaceId}/vendors/${vendor.id}/edit`)}
                >
                  <Edit className="mr-2 size-4" /> Edit Vendor Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleToggleBlacklist(vendor.id, vendor.status)}
                  className={
                    vendor.status === "BLACKLISTED"
                      ? "text-emerald-600 hover:text-emerald-700 font-medium"
                      : "text-red-600 hover:text-red-700 font-medium"
                  }
                >
                  {vendor.status === "BLACKLISTED" ? (
                    <>
                      <CheckCircle className="mr-2 size-4" /> Activate Supplier
                    </>
                  ) : (
                    <>
                      <Ban className="mr-2 size-4" /> Blacklist Supplier
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  // Get all unique locations for the faceted filter
  const locationOptions = Array.from(
    new Set(
      vendors
        .map((v) => {
          const parts = [v.city, v.state].filter(Boolean);
          return parts.length > 0 ? parts.join(", ") : "";
        })
        .filter(Boolean)
    )
  ).map((loc) => ({
    label: loc,
    value: loc,
  }));

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
            isLoading={loading}
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
              {
                label: "Location",
                value: "location",
                options: locationOptions,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
