"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Truck, MoreVertical, Ban, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function VendorsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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
        // Change status to ACTIVE
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
        // Call DELETE endpoint (which blacklists)
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

  const filteredVendors = vendors.filter((v) => {
    const search = searchQuery.toLowerCase();
    return (
      v.name.toLowerCase().includes(search) ||
      (v.companyName && v.companyName.toLowerCase().includes(search)) ||
      (v.gstNumber && v.gstNumber.toLowerCase().includes(search))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> Vendor Directory
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your procurement ecosystem, onboard new suppliers, and track material capabilities.
          </p>
        </div>

        <Button onClick={() => router.push(`/w/${workspaceId}/vendors/new`)} className="gap-2">
          <Plus className="h-4 w-4" /> Onboard Vendor
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2 max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by vendor, company name, or GST..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border-t">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="font-semibold">Supplier Details</TableHead>
                  <TableHead className="font-semibold">Contact Person</TableHead>
                  <TableHead className="font-semibold">GSTIN</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                      Loading your vendor ecosystem...
                    </TableCell>
                  </TableRow>
                ) : filteredVendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                      No vendors onboarded in this workspace yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVendors.map((vendor) => (
                    <TableRow key={vendor.id} className="hover:bg-gray-50/50 transition">
                      <TableCell>
                        <div className="font-medium text-gray-900">{vendor.name}</div>
                        {vendor.companyName && (
                          <div className="text-xs text-muted-foreground">{vendor.companyName}</div>
                        )}
                        <div className="text-xs text-muted-foreground/80 mt-0.5">
                          {vendor.email || "No email"} • {vendor.phoneNumber || "No phone"}
                          {(vendor.city || vendor.state) && (
                            <span> • {[vendor.city, vendor.state].filter(Boolean).join(", ")}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-gray-700">
                        {vendor.contactPerson || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm tracking-wide">
                        {vendor.gstNumber || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={vendor.status === "ACTIVE" ? "outline" : "destructive"}
                          className={
                            vendor.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
                              : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-50"
                          }
                        >
                          {vendor.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => router.push(`/w/${workspaceId}/vendors/${vendor.id}`)}
                          >
                            Capabilities <ExternalLink className="h-3 w-3" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
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
                                    <CheckCircle className="mr-2 h-4 w-4" /> Activate Supplier
                                  </>
                                ) : (
                                  <>
                                    <Ban className="mr-2 h-4 w-4" /> Blacklist Supplier
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
