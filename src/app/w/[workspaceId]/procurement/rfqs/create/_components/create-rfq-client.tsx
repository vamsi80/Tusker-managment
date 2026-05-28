"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Building,
  Check,
  Clock,
  MapPin,
  Phone,
  Plus,
  Trash2,
  X,
  FileText,
  Search,
} from "lucide-react";
import { toast } from "sonner";

interface CreateRfqClientProps {
  workspaceId: string;
  indents: any[];
  vendors: any[];
}

export function CreateRfqClient({ workspaceId, indents, vendors }: CreateRfqClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Selected approved indent for whole indent import
  const [bulkIndentId, setBulkIndentId] = useState<string>("");

  // Grid/Sheet states
  const [selectedVendorIds, setSelectedVendorIds] = useState<(string | null)[]>([null, null, null, null]);
  const [selectedRowItems, setSelectedRowItems] = useState<any[]>([]);
  const [rfqDeadline, setRfqDeadline] = useState<string>(
    format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd") // Default: 7 days from now
  );

  // Search filters
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");
  const [materialSearchQuery, setMaterialSearchQuery] = useState("");

  // Rates, lead times, and notes state for each vendor and item
  // Key format: `${vendorId}_${lineItemId}`
  const [rates, setRates] = useState<Record<string, number>>({});
  const [leadTimes, setLeadTimes] = useState<Record<string, number>>({}); // Key: vendorId
  const [vendorNotes, setVendorNotes] = useState<Record<string, string>>({}); // Key: vendorId

  // Flattened pending line items list across all approved indents for material picker
  const allPendingItems = indents.flatMap((ind) =>
    ind.lineItems.map((item: any) => ({
      ...item,
      indentName: ind.name,
      project: ind.project,
    }))
  );

  // Filter out items already selected in the table
  const availablePendingItems = allPendingItems.filter(
    (item) => !selectedRowItems.some((selected) => selected.id === item.id)
  );

  // Filter available materials based on search query
  const filteredAvailableMaterials = availablePendingItems.filter((item) =>
    item.materialName.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
    item.indentName.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
    item.project?.name.toLowerCase().includes(materialSearchQuery.toLowerCase())
  );

  // Filter vendors based on search query
  const filteredVendors = vendors.filter((v) => {
    const query = vendorSearchQuery.toLowerCase();
    return (
      v.name.toLowerCase().includes(query) ||
      (v.companyName && v.companyName.toLowerCase().includes(query))
    );
  });

  // Import entire indent items
  const handleImportIndent = () => {
    if (!bulkIndentId) {
      toast.error("Please select an approved indent to import");
      return;
    }
    const targetIndent = indents.find((ind) => ind.id === bulkIndentId);
    if (!targetIndent) return;

    const newItems = targetIndent.lineItems.map((item: any) => ({
      ...item,
      indentName: targetIndent.name,
      project: targetIndent.project,
    }));

    setSelectedRowItems((prev) => {
      // Avoid duplicate line item ids
      const filteredPrev = prev.filter(
        (p) => !newItems.some((n: any) => n.id === p.id)
      );
      return [...filteredPrev, ...newItems];
    });

    toast.success(`Imported ${newItems.length} items from ${targetIndent.name}`);
    setBulkIndentId("");
  };

  // Add individual material row
  const handleAddMaterial = (item: any) => {
    setSelectedRowItems((prev) => [...prev, item]);
    toast.success(`Added ${item.materialName} to comparison`);
  };

  // Remove material row
  const handleRemoveMaterial = (itemId: string) => {
    setSelectedRowItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Set vendor column
  const handleSetVendor = (colIdx: number, vendorId: string | null) => {
    setSelectedVendorIds((prev) => {
      const copy = [...prev];
      copy[colIdx] = vendorId;
      return copy;
    });
  };

  // Clear vendor column
  const handleClearVendor = (colIdx: number) => {
    handleSetVendor(colIdx, null);
  };

  // Handle Rate inputs
  const handleRateChange = (vendorId: string, lineItemId: string, value: string) => {
    const val = parseFloat(value);
    setRates((prev) => ({
      ...prev,
      [`${vendorId}_${lineItemId}`]: isNaN(val) ? 0 : val,
    }));
  };

  // Helper to calculate total cost for a vendor column
  const getVendorTotal = (vendorId: string) => {
    return selectedRowItems.reduce((sum: number, item: any) => {
      const rate = rates[`${vendorId}_${item.id}`] || 0;
      return sum + rate * item.quantity;
    }, 0);
  };

  // Validate and submit RFQs
  const handleCreateRfq = async () => {
    const activeVendorIds = selectedVendorIds.filter((vId): vId is string => !!vId);

    if (selectedRowItems.length === 0) {
      toast.error("Please add at least one material item to compare");
      return;
    }
    if (activeVendorIds.length === 0) {
      toast.error("Please select at least one vendor for comparison");
      return;
    }
    if (!rfqDeadline) {
      toast.error("Please set a response deadline");
      return;
    }

    startTransition(async () => {
      try {
        const deadlineDate = new Date(rfqDeadline);

        // Group selected row items by lineItemId so we dispatch correctly
        for (const item of selectedRowItems) {
          // 1. Send RFQ to chosen vendors for this line item
          const res = await fetch(`/api/v1/procurement/rfq/send?w=${workspaceId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lineItemId: item.id,
              vendorIds: activeVendorIds,
              deadline: deadlineDate.toISOString(),
            }),
          });
          const data = await res.json();
          if (!data.success) {
            toast.error(`Failed to send RFQ for ${item.materialName}: ${data.error}`);
            return;
          }

          // 2. Submit quotes if any rates are filled
          for (const vendorId of activeVendorIds) {
            const rateKey = `${vendorId}_${item.id}`;
            const unitPrice = rates[rateKey] || 0;

            if (unitPrice > 0) {
              const quoteRes = await fetch(`/api/v1/procurement/rfq/quotes?w=${workspaceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lineItemId: item.id,
                  vendorId,
                  unitPrice,
                  quantity: item.quantity,
                  leadTimeDays: leadTimes[vendorId] || undefined,
                  notes: vendorNotes[vendorId] || undefined,
                }),
              });
              const quoteData = await quoteRes.json();
              if (!quoteData.success) {
                toast.error(`Failed to record quote for ${item.materialName}: ${quoteData.error}`);
              }
            }
          }
        }

        toast.success("RFQs dispatched and quotes saved successfully!");
        router.push(`/w/${workspaceId}/procurement/rfqs`);
        router.refresh();
      } catch (err) {
        toast.error("An error occurred while creating the RFQ comparison sheet");
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
      {/* Top action header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/w/${workspaceId}/procurement/rfqs`)}
            className="size-8"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold text-foreground">RFQ Comparison Sheet</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add vendors and material items directly inside the comparison sheet
            </p>
          </div>
        </div>

        {/* Global form controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="deadline" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Response Deadline:
            </Label>
            <Input
              id="deadline"
              type="date"
              value={rfqDeadline}
              onChange={(e) => setRfqDeadline(e.target.value)}
              className="h-8 text-xs py-1 px-2.5 w-36"
            />
          </div>
          <Button
            size="sm"
            onClick={handleCreateRfq}
            disabled={isPending}
            className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending ? "Dispatching..." : "Create & Dispatch RFQ"}
          </Button>
        </div>
      </div>

      {/* Toolbar for bulk import */}
      <div className="flex items-center gap-3 p-3 bg-muted/20 border rounded-lg shrink-0">
        <span className="text-xs font-bold text-muted-foreground">Import from Indent:</span>
        <Select value={bulkIndentId} onValueChange={setBulkIndentId}>
          <SelectTrigger className="h-8 text-xs w-64 bg-background">
            <SelectValue placeholder="Select an approved indent..." />
          </SelectTrigger>
          <SelectContent>
            {indents.map((ind) => (
              <SelectItem key={ind.id} value={ind.id} className="text-xs">
                {ind.name} ({ind.project?.name})
              </SelectItem>
            ))}
            {indents.length === 0 && (
              <SelectItem value="none" disabled className="text-xs">
                No approved indents available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleImportIndent}
          disabled={!bulkIndentId}
          className="h-8 text-xs font-semibold"
        >
          Import Items
        </Button>
      </div>

      {/* Main comparative table layout */}
      <div className="flex-1 border rounded-lg bg-card overflow-auto min-h-0">
        <table className="w-full border-collapse text-left table-fixed min-w-[1200px]">
          <thead>
            {/* Row 1: Vendor Header/Selectors */}
            <tr className="bg-muted/15 border-b">
              {/* Vertical Title spacer */}
              <th className="w-10 p-0 border-r bg-neutral-900" rowSpan={8}>
                <div className="h-full flex items-center justify-center py-6">
                  <span className="transform -rotate-90 origin-center text-neutral-400 font-black tracking-widest text-[10px] uppercase whitespace-nowrap block">
                    COMPARISON
                  </span>
                </div>
              </th>
              {/* Material metadata cols spacer */}
              <th className="w-48 p-3 text-[11px] font-bold text-muted-foreground border-r bg-muted/10"></th>
              <th className="w-20 p-3 text-[11px] font-bold text-muted-foreground border-r bg-muted/10"></th>
              <th className="w-20 p-3 text-[11px] font-bold text-muted-foreground border-r bg-muted/10"></th>

              {/* Vendor columns (4 total) */}
              {selectedVendorIds.map((vId, idx) => {
                const vendor = vId ? vendors.find((v) => v.id === vId) : null;
                return (
                  <th key={`vendor-head-${idx}`} className="p-3 border-r bg-muted/5 w-72" colSpan={2}>
                    {vendor ? (
                      <div className="flex flex-col gap-1.5 relative group">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleClearVendor(idx)}
                          className="absolute -top-1 -right-1 size-5 rounded-full hover:bg-red-50 hover:text-red-600 text-muted-foreground"
                        >
                          <X className="size-3" />
                        </Button>
                        <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                          <Building className="size-3 text-primary" /> Column {idx + 1}
                        </span>
                        <div className="flex flex-col pr-4">
                          <span className="text-xs font-bold text-foreground truncate">{vendor.name}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {vendor.companyName || "No Company Specified"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs font-semibold flex items-center gap-1 w-full border-dashed"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add Vendor {idx + 1}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-0" align="start">
                            <div className="p-3 border-b bg-muted/10 shrink-0">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                  placeholder="Search vendors..."
                                  value={vendorSearchQuery}
                                  onChange={(e) => setVendorSearchQuery(e.target.value)}
                                  className="pl-8 h-8 text-xs"
                                />
                              </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto divide-y">
                              {filteredVendors.map((v) => {
                                const isAlreadyUsed = selectedVendorIds.includes(v.id);
                                return (
                                  <button
                                    key={v.id}
                                    onClick={() => {
                                      handleSetVendor(idx, v.id);
                                      setVendorSearchQuery("");
                                    }}
                                    disabled={isAlreadyUsed}
                                    className="w-full text-left p-2.5 text-xs transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <div className="font-semibold text-foreground flex items-center justify-between">
                                      <span>{v.name}</span>
                                      {isAlreadyUsed && <Badge variant="secondary" className="text-[9px]">Added</Badge>}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">{v.companyName || "—"}</div>
                                  </button>
                                );
                              })}
                              {filteredVendors.length === 0 && (
                                <div className="p-4 text-center text-xs text-muted-foreground">No vendors found</div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>

            {/* Row 2: Contact Person */}
            <tr className="border-b">
              <th className="p-2 text-[10px] uppercase font-bold text-muted-foreground border-r bg-muted/5">
                Contact Name →
              </th>
              <th className="p-2 border-r bg-muted/5" colSpan={2}></th>
              {selectedVendorIds.map((vId, idx) => {
                const vendor = vId ? vendors.find((v) => v.id === vId) : null;
                return (
                  <th key={`contact-${idx}`} className="p-2 border-r font-medium text-xs text-foreground truncate" colSpan={2}>
                    {vendor?.contactPerson || "—"}
                  </th>
                );
              })}
            </tr>

            {/* Row 3: Contact Phone */}
            <tr className="border-b">
              <th className="p-2 text-[10px] uppercase font-bold text-muted-foreground border-r bg-muted/5">
                Contact Number →
              </th>
              <th className="p-2 border-r bg-muted/5" colSpan={2}></th>
              {selectedVendorIds.map((vId, idx) => {
                const vendor = vId ? vendors.find((v) => v.id === vId) : null;
                return (
                  <th key={`phone-${idx}`} className="p-2 border-r font-mono text-xs text-foreground truncate" colSpan={2}>
                    {vendor?.phoneNumber || "—"}
                  </th>
                );
              })}
            </tr>

            {/* Row 4: Vendor Location */}
            <tr className="border-b">
              <th className="p-2 text-[10px] uppercase font-bold text-muted-foreground border-r bg-muted/5">
                Vendor Location →
              </th>
              <th className="p-2 border-r bg-muted/5" colSpan={2}></th>
              {selectedVendorIds.map((vId, idx) => {
                const vendor = vId ? vendors.find((v) => v.id === vId) : null;
                return (
                  <th key={`loc-${idx}`} className="p-2 border-r font-medium text-[11px] text-foreground truncate" colSpan={2}>
                    {vendor ? `${vendor.city || ""} ${vendor.state || ""}`.trim() || "—" : "—"}
                  </th>
                );
              })}
            </tr>

            {/* Row 5: Lead Time */}
            <tr className="border-b">
              <th className="p-2 text-[10px] uppercase font-bold text-muted-foreground border-r bg-muted/5 flex items-center gap-1">
                Lead Time → <Clock className="size-3" />
              </th>
              <th className="p-2 border-r bg-muted/5" colSpan={2}></th>
              {selectedVendorIds.map((vId, idx) => {
                return (
                  <th key={`lt-${idx}`} className="p-2 border-r" colSpan={2}>
                    {vId ? (
                      <div className="flex items-center gap-1.5 w-32">
                        <Input
                          type="number"
                          placeholder="Days"
                          value={leadTimes[vId] || ""}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setLeadTimes((prev) => ({
                              ...prev,
                              [vId]: isNaN(val) ? 0 : val,
                            }));
                          }}
                          className="h-7 text-xs px-2 py-0.5"
                        />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Days</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </th>
                );
              })}
            </tr>

            {/* Row 6: NOTES */}
            <tr className="border-b">
              <th className="p-2 text-[10px] uppercase font-bold text-muted-foreground border-r bg-muted/5">
                NOTES →
              </th>
              <th className="p-2 border-r bg-muted/5" colSpan={2}></th>
              {selectedVendorIds.map((vId, idx) => {
                return (
                  <th key={`notes-${idx}`} className="p-2 border-r" colSpan={2}>
                    {vId ? (
                      <Input
                        placeholder="Add notes..."
                        value={vendorNotes[vId] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVendorNotes((prev) => ({
                            ...prev,
                            [vId]: val,
                          }));
                        }}
                        className="h-7 text-xs px-2 py-0.5 w-full"
                      />
                    ) : (
                      "—"
                    )}
                  </th>
                );
              })}
            </tr>

            {/* Column Category Titles */}
            <tr className="bg-muted/20 border-b border-neutral-300">
              <th className="p-2 text-[10px] uppercase font-bold text-muted-foreground border-r">
                Specifications / Material Name
              </th>
              <th className="p-2 text-[10px] uppercase font-bold text-muted-foreground border-r w-20 text-center">
                Qty Req
              </th>
              <th className="p-2 text-[10px] uppercase font-bold text-muted-foreground border-r w-20 text-center">
                UOM
              </th>
              {selectedVendorIds.map((vId, idx) => (
                <th key={`cats-${idx}`} className="p-0 border-r" colSpan={2}>
                  <div className="grid grid-cols-2 text-center text-[10px] uppercase font-bold text-muted-foreground">
                    <div className="py-2 border-r">Rate/Unit</div>
                    <div className="py-2">Amount</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Selected Material Rows */}
            {selectedRowItems.map((item) => (
              <tr key={item.id} className="border-b transition-colors hover:bg-muted/10 group">
                <td className="p-2.5 border-r font-semibold text-xs text-foreground flex items-center justify-between">
                  <div className="flex flex-col gap-0.5 truncate">
                    <span className="truncate">{item.materialName}</span>
                    <span className="text-[9px] text-muted-foreground truncate">
                      Project: {item.project?.name} | Indent: {item.indentName}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveMaterial(item.id)}
                    className="size-6 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 text-muted-foreground shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
                <td className="p-2.5 border-r text-center font-mono text-xs text-foreground">
                  {item.quantity}
                </td>
                <td className="p-2.5 border-r text-center text-xs text-muted-foreground uppercase">
                  {item.unit}
                </td>
                {selectedVendorIds.map((vId, idx) => {
                  if (!vId) {
                    return <td key={`cell-empty-${idx}`} className="p-2.5 border-r bg-muted/5" colSpan={2}></td>;
                  }
                  const rateKey = `${vId}_${item.id}`;
                  const rateVal = rates[rateKey] || 0;
                  const amount = rateVal * item.quantity;
                  return (
                    <td key={`cell-${vId}-${item.id}`} className="p-0 border-r" colSpan={2}>
                      <div className="grid grid-cols-2 items-center">
                        <div className="p-1.5 border-r">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={rates[rateKey] || ""}
                            onChange={(e) => handleRateChange(vId, item.id, e.target.value)}
                            className="h-7 text-xs px-2 py-0.5"
                          />
                        </div>
                        <div className="p-2 text-right font-mono text-xs text-foreground font-semibold">
                          ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Empty State */}
            {selectedRowItems.length === 0 && (
              <tr>
                <td colSpan={11} className="p-12 text-center text-xs text-muted-foreground">
                  No materials added to comparison. Click "+ Add Material Row" below or use bulk import above.
                </td>
              </tr>
            )}

            {/* Row 7: Add Material Inline Trigger Row */}
            <tr className="border-b bg-muted/5">
              <td className="p-2 border-r" colSpan={3}>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs font-semibold flex items-center gap-1 border-dashed w-full"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Material Row
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96 p-0" align="start">
                    <div className="p-3 border-b bg-muted/10 shrink-0">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search pending materials..."
                          value={materialSearchQuery}
                          onChange={(e) => setMaterialSearchQuery(e.target.value)}
                          className="pl-8 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y">
                      {filteredAvailableMaterials.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            handleAddMaterial(item);
                            setMaterialSearchQuery("");
                          }}
                          className="w-full text-left p-2.5 text-xs transition-colors hover:bg-muted/50"
                        >
                          <div className="font-semibold text-foreground">{item.materialName}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Qty: {item.quantity} {item.unit} | Project: {item.project?.name}
                          </div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">
                            Indent: {item.indentName}
                          </div>
                        </button>
                      ))}
                      {filteredAvailableMaterials.length === 0 && (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No pending approved materials found
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </td>
              {selectedVendorIds.map((_, idx) => (
                <td key={`empty-add-row-${idx}`} className="p-2 border-r" colSpan={2}></td>
              ))}
            </tr>

            {/* Row 8: Summary Total Cost Row */}
            <tr className="bg-muted/30 font-bold border-t border-neutral-300">
              <td className="p-3 border-r text-xs uppercase font-extrabold text-foreground">
                TOTAL COST
              </td>
              <td className="p-3 border-r" colSpan={2}></td>
              {selectedVendorIds.map((vId, idx) => {
                if (!vId) {
                  return <td key={`total-empty-${idx}`} className="p-3 border-r" colSpan={2}></td>;
                }
                const total = getVendorTotal(vId);
                return (
                  <td key={`total-${vId}`} className="p-0 border-r" colSpan={2}>
                    <div className="grid grid-cols-2 items-center h-full">
                      <div className="border-r h-full"></div>
                      <div className="p-3 text-right font-mono text-sm text-foreground font-bold">
                        ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
