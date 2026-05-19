"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";

export default function VendorDetailPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const vendorId = params.vendorId as string;

  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchCapabilities();
  }, [vendorId, workspaceId]);

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
      setLoading(false);
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Vendor Management</h1>

      <Card>
        <CardHeader>
          <CardTitle>Material Capabilities</CardTitle>
          <CardDescription>
            Manage what materials this vendor can supply. Capabilities are automatically recorded when quotes are approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAddCapability} className="flex gap-4 items-end">
            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium">Material Name</label>
              <Input
                value={newMaterialName}
                onChange={(e) => setNewMaterialName(e.target.value)}
                placeholder="e.g. TMT Steel Bars"
              />
            </div>
            <div className="space-y-1 w-32">
              <label className="text-sm font-medium">Unit</label>
              <Input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="e.g. ton"
              />
            </div>
            <Button type="submit" disabled={adding || !newMaterialName.trim()}>
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Capability
            </Button>
          </form>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                      Loading capabilities...
                    </TableCell>
                  </TableRow>
                ) : capabilities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                      No capabilities recorded for this vendor yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  capabilities.map((cap) => (
                    <TableRow key={cap.id}>
                      <TableCell className="font-medium capitalize">{cap.materialName}</TableCell>
                      <TableCell>{cap.unit || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={cap.source === "AUTO" ? "secondary" : "outline"} className={cap.source === "AUTO" ? "bg-blue-50 text-blue-700" : ""}>
                          {cap.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveCapability(cap.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
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
  );
}
