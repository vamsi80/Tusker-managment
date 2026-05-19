"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface VendorCapabilitiesProps {
  vendorId: string;
  workspaceId: string;
}

export function VendorCapabilities({ vendorId, workspaceId }: VendorCapabilitiesProps) {
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [loadingCaps, setLoadingCaps] = useState(true);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [customMaterialName, setCustomMaterialName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newServiceType, setNewServiceType] = useState<"SUPPLY" | "LABOUR" | "LABOUR_WITH_MATERIAL">("SUPPLY");
  const [adding, setAdding] = useState(false);
  const [existingItems, setExistingItems] = useState<{ id: string; name: string; type: "material" | "tag"; unit?: string }[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchCapabilities();
    fetchExistingTagsAndMaterials();
  }, [vendorId, workspaceId]);

  const fetchExistingTagsAndMaterials = async () => {
    try {
      const matRes = await fetch(`/api/v1/procurement/vendors/materials/all?w=${workspaceId}`);
      const matData = await matRes.json();
      
      const tagRes = await fetch(`/api/v1/tags?workspaceId=${workspaceId}`);
      const tagData = await tagRes.json();

      const items: any[] = [];
      
      if (matData.success && matData.data) {
        matData.data.forEach((m: any) => {
          items.push({
            id: m.id,
            name: m.name,
            type: "material",
            unit: m.defaultUnit?.abbreviation
          });
        });
      }

      if (tagData.success && tagData.tags) {
        tagData.tags.forEach((t: any) => {
          items.push({
            id: t.id,
            name: t.name,
            type: "tag"
          });
        });
      }

      // De-duplicate items by case-insensitive name
      const uniqueItems = items.filter(
        (item, index, self) => self.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase()) === index
      );

      setExistingItems(uniqueItems);
    } catch (error) {
      console.error("Failed to fetch existing tags/materials:", error);
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

  const handleMaterialSelect = (val: string) => {
    setSelectedMaterialId(val);
    const matched = existingItems.find((item) => item.id === val);
    if (matched && matched.unit) {
      setNewUnit(matched.unit);
    }
    setPopoverOpen(false);
  };

  const handleCreateCustom = (customName: string) => {
    setSelectedMaterialId("CUSTOM");
    setCustomMaterialName(customName);
    setPopoverOpen(false);
  };

  const handleAddCapability = async (e: React.FormEvent) => {
    e.preventDefault();
    const materialName = selectedMaterialId === "CUSTOM" 
      ? customMaterialName.trim() 
      : (existingItems.find((i) => i.id === selectedMaterialId)?.name || "");

    if (!materialName) {
      toast.error("Please select or enter a material name");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}/capabilities?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialName,
          unit: newUnit || undefined,
          serviceType: newServiceType,
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Capability added successfully");
        setSelectedMaterialId("");
        setCustomMaterialName("");
        setNewUnit("");
        setNewServiceType("SUPPLY");
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

  const newMaterialName = selectedMaterialId === "CUSTOM"
    ? customMaterialName.trim()
    : (existingItems.find((i) => i.id === selectedMaterialId)?.name || "");

  const capabilityExists = capabilities.some(
    (cap) =>
      cap.materialName.toLowerCase() === newMaterialName.toLowerCase() &&
      cap.serviceType === newServiceType
  );

  return (
    <Card className="shadow-sm border-border/50 h-full">
      <CardHeader className="border-b bg-muted/30 py-2.5 px-6">
        <CardTitle className="text-md font-semibold text-card-foreground">Material Capabilities</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <form onSubmit={handleAddCapability} className="space-y-4 bg-muted/10 p-4 rounded-lg border border-dashed border-border">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="space-y-1 md:col-span-5">
              <label className="text-xs font-semibold text-muted-foreground">Material / Service Name</label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={popoverOpen}
                    className="w-full justify-between h-9 bg-background font-normal text-left border border-input shadow-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="truncate">
                      {selectedMaterialId === "CUSTOM"
                        ? (customMaterialName || "New Material / Service")
                        : selectedMaterialId
                          ? (existingItems.find((item) => item.id === selectedMaterialId)?.name || "Select Material / Service...")
                          : "Select Material / Service..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0" align="start">
                  <Command loop>
                    <CommandInput
                      placeholder="Search or enter new material..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                      <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                        No materials found. Type to create custom.
                      </CommandEmpty>
                      <CommandGroup>
                        {searchQuery.trim() && !existingItems.some(item => item.name.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                          <CommandItem
                            value={searchQuery}
                            onSelect={() => {
                              handleCreateCustom(searchQuery.trim());
                              setSearchQuery("");
                            }}
                            className="text-primary font-medium cursor-pointer"
                          >
                            <Plus className="mr-2 h-4 w-4 text-primary" /> Create new &quot;{searchQuery.trim()}&quot;
                          </CommandItem>
                        )}
                        {existingItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={item.name}
                            onSelect={() => {
                              handleMaterialSelect(item.id);
                              setSearchQuery("");
                            }}
                            className="cursor-pointer flex items-center"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedMaterialId === item.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="truncate">{item.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground capitalize">
                              {item.type}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedMaterialId === "CUSTOM" && (
                <div className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 mt-1.5 flex items-center gap-1 w-fit uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  New Material
                </div>
              )}
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Unit (optional)</label>
              <Input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="e.g. ton, sqm, runs"
                className="bg-background h-9"
              />
            </div>
            <div className="space-y-1 md:col-span-4">
              <label className="text-xs font-semibold text-muted-foreground">Service Type</label>
              <select
                value={newServiceType}
                onChange={(e) => setNewServiceType(e.target.value as any)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground"
              >
                <option value="SUPPLY" className="bg-background text-foreground">📦 Supply Only</option>
                <option value="LABOUR" className="bg-background text-foreground">🔨 Labour Only</option>
                <option value="LABOUR_WITH_MATERIAL" className="bg-background text-foreground">🔄 Labour & Material (Turnkey)</option>
              </select>
            </div>
            <div className="md:col-span-1">
              <Button
                type="submit"
                disabled={adding || !newMaterialName.trim() || capabilityExists}
                className="h-9 w-full p-0 flex items-center justify-center shrink-0"
                title="Add Capability"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {capabilityExists && (
            <p className="text-sm font-medium text-amber-500 mt-2 bg-amber-500/10 border border-amber-500/20 rounded p-2 flex items-center gap-1.5">
              ⚠️ A capability for &quot;{newMaterialName}&quot; with {newServiceType === "SUPPLY" ? "Supply Only" : newServiceType === "LABOUR" ? "Labour Only" : "Labour & Material"} already exists for this vendor.
            </p>
          )}
        </form>

        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-semibold">Material / Service Name</TableHead>
                <TableHead className="font-semibold">Unit</TableHead>
                <TableHead className="font-semibold">Service Type</TableHead>
                <TableHead className="font-semibold">Source</TableHead>
                <TableHead className="w-[80px] text-right font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingCaps ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : capabilities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No capabilities recorded for this vendor yet.
                  </TableCell>
                </TableRow>
              ) : (
                capabilities.map((cap) => (
                  <TableRow key={cap.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium capitalize text-foreground">{cap.materialName}</TableCell>
                    <TableCell className="text-muted-foreground">{cap.unit || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          cap.serviceType === "SUPPLY"
                            ? "bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/15"
                            : cap.serviceType === "LABOUR"
                              ? "bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/15"
                              : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20 hover:bg-indigo-500/15"
                        }
                      >
                        {cap.serviceType === "SUPPLY" ? "📦 Supply" : cap.serviceType === "LABOUR" ? "🔨 Labour" : "🔄 Labour + Material"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={cap.source === "AUTO" ? "secondary" : "outline"}
                        className={
                          cap.source === "AUTO"
                            ? "bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/15"
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
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
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
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
  );
}
