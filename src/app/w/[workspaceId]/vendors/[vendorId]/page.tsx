"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, ArrowLeft, Building2, User, Phone, Mail, FileSpreadsheet, MapPin } from "lucide-react";

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const vendorId = params.vendorId as string;

  const [vendor, setVendor] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [loadingCaps, setLoadingCaps] = useState(true);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchVendorDetails();
    fetchCapabilities();
  }, [vendorId, workspaceId]);

  const fetchVendorDetails = async () => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setVendor(data.data);
      } else {
        toast.error("Failed to load vendor details");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error loading vendor details");
    } finally {
      setLoadingVendor(false);
    }
  };

  const fetchCapabilities = async () => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}/capabilities?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setCapabilities(data.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingCaps(false);
    }
  };

  const handleAddCapability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterialName.trim()) return;

    setAdding(true);
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}/capabilities?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialName: newMaterialName,
          unit: newUnit || undefined,
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Capability added successfully");
        setNewMaterialName("");
        setNewUnit("");
        fetchCapabilities();
      } else {
        toast.error(data.error || "Failed to add capability");
      }
    } catch (error) {
      toast.error("Failed to add capability");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveCapability = async (capId: string) => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}/capabilities/${capId}?w=${workspaceId}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Capability removed");
        fetchCapabilities();
      } else {
        toast.error(data.error || "Failed to remove capability");
      }
    } catch (error) {
      toast.error("Failed to remove capability");
    }
  };

  if (loadingVendor) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading vendor profile...</span>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-gray-900">Vendor not found</h2>
        <Button onClick={() => router.push(`/w/${workspaceId}/vendors`)} className="mt-4">
          Back to Directory
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={() => router.push(`/w/${workspaceId}/vendors`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            {vendor.name}
            <Badge
              variant={vendor.status === "ACTIVE" ? "outline" : "destructive"}
              className={
                vendor.status === "ACTIVE"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }
            >
              {vendor.status}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {vendor.companyName || "No legal name registered"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Vendor Profile Info (Structured Address, Contact) */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-sm border-border/50">
            <CardHeader className="border-b bg-gray-50/50 py-4 px-6">
              <CardTitle className="text-md font-semibold flex items-center gap-2 text-gray-800">
                <Building2 className="h-4 w-4 text-muted-foreground" /> Contact & Registry
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Person</div>
                <div className="text-sm font-medium text-gray-950 flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" /> {vendor.contactPerson || "Not Provided"}
                </div>
              </div>

              <div className="space-y-1 border-t pt-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone Number</div>
                <div className="text-sm font-medium text-gray-950 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" /> {vendor.phoneNumber || "Not Provided"}
                </div>
              </div>

              <div className="space-y-1 border-t pt-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</div>
                <div className="text-sm font-medium text-gray-950 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" /> {vendor.email || "Not Provided"}
                </div>
              </div>

              <div className="space-y-1 border-t pt-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">GSTIN / Tax ID</div>
                <div className="text-sm font-mono text-gray-950 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> {vendor.gstNumber || "Not Provided"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardHeader className="border-b bg-gray-50/50 py-4 px-6">
              <CardTitle className="text-md font-semibold flex items-center gap-2 text-gray-800">
                <MapPin className="h-4 w-4 text-muted-foreground" /> Registered Address
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              {vendor.addressLine1 || vendor.city || vendor.state ? (
                <div className="space-y-1.5 text-sm text-gray-800">
                  {vendor.addressLine1 && <div>{vendor.addressLine1}</div>}
                  {vendor.addressLine2 && <div className="text-muted-foreground">{vendor.addressLine2}</div>}
                  {(vendor.city || vendor.state || vendor.pincode) && (
                    <div className="font-medium">
                      {[vendor.city, vendor.state].filter(Boolean).join(", ")}
                      {vendor.pincode ? ` - ${vendor.pincode}` : ""}
                    </div>
                  )}
                  {vendor.country && <div className="text-xs text-muted-foreground font-semibold uppercase mt-1">{vendor.country}</div>}
                </div>
              ) : vendor.address ? (
                // Fallback to legacy address if present
                <div className="text-sm text-gray-800 italic">{vendor.address}</div>
              ) : (
                <div className="text-sm text-muted-foreground italic">No address registered for this vendor.</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Material Capabilities */}
        <div className="lg:col-span-2">
          <Card className="shadow-sm border-border/50 h-full">
            <CardHeader className="border-b bg-gray-50/50 py-4 px-6">
              <CardTitle className="text-md font-semibold text-gray-800">Material Capabilities</CardTitle>
              <CardDescription>
                Manage what materials this vendor can supply. Capabilities are automatically recorded when quotes are approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <form onSubmit={handleAddCapability} className="flex gap-4 items-end bg-gray-50/50 p-4 rounded-lg border border-dashed">
                <div className="space-y-1 flex-1">
                  <label className="text-xs font-semibold text-gray-700">Material Name</label>
                  <Input
                    required
                    value={newMaterialName}
                    onChange={(e) => setNewMaterialName(e.target.value)}
                    placeholder="e.g. TMT Steel Bars"
                    className="bg-white h-9"
                  />
                </div>
                <div className="space-y-1 w-32">
                  <label className="text-xs font-semibold text-gray-700">Unit</label>
                  <Input
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="e.g. ton"
                    className="bg-white h-9"
                  />
                </div>
                <Button type="submit" disabled={adding || !newMaterialName.trim()} className="h-9">
                  {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Tag
                </Button>
              </form>

              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="font-semibold">Material Name</TableHead>
                      <TableHead className="font-semibold">Unit</TableHead>
                      <TableHead className="font-semibold">Source</TableHead>
                      <TableHead className="w-[80px] text-right font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingCaps ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : capabilities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No capabilities recorded for this vendor yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      capabilities.map((cap) => (
                        <TableRow key={cap.id} className="hover:bg-gray-50/20">
                          <TableCell className="font-medium capitalize text-gray-900">{cap.materialName}</TableCell>
                          <TableCell className="text-gray-600">{cap.unit || "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={cap.source === "AUTO" ? "secondary" : "outline"}
                              className={
                                cap.source === "AUTO"
                                  ? "bg-blue-50 text-blue-700 border-blue-150 hover:bg-blue-50"
                                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-50"
                              }
                            >
                              {cap.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveCapability(cap.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
      </div>
    </div>
  );
}
