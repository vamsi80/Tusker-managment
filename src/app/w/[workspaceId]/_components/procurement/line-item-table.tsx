"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, CornerDownRight, ChevronRight, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VendorMatchPill } from "./vendor-match-pill";
import { RfqSheet } from "./rfq-sheet";

function AutoCompleteInput({ 
  value, 
  onChange, 
  onUnitAutoFill,
  disabled, 
  catalog,
  isLoading 
}: { 
  value: string; 
  onChange: (val: string) => void;
  onUnitAutoFill?: (unit: string) => void;
  disabled: boolean;
  catalog: any[];
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  
  const filtered = value
    ? catalog.filter(c => c.name.toLowerCase().includes(value.toLowerCase()))
    : catalog;

  return (
    <div className="relative w-full">
      <Input
        placeholder={isLoading ? "Loading..." : "e.g. TMT Steel 10mm"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 200);
        }}
        disabled={disabled || isLoading}
        className="h-8 text-xs bg-background"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-[300px] bg-popover border border-border/80 rounded-md shadow-lg z-[100] max-h-48 overflow-y-auto overflow-x-hidden">
          {filtered.map(item => (
            <div
              key={item.id}
              className="px-3 py-2 text-xs cursor-pointer hover:bg-accent text-popover-foreground flex items-center transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(item.name);
                if (item.unit && onUnitAutoFill) {
                  onUnitAutoFill(item.unit);
                }
                setOpen(false);
              }}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface LineItemTableProps {
  indent: any;
  workspaceId: string;
  workspaceRole?: string;
  isWorkspaceAdmin?: boolean;
  onUpdate: (updatedIndent: any) => void;
}

export function LineItemTable({
  indent,
  workspaceId,
  workspaceRole,
  isWorkspaceAdmin = false,
  onUpdate,
}: LineItemTableProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [unit, setUnit] = useState("pcs");
  const [quantity, setQuantity] = useState<number | "">("");
  const [estimatedUnitPrice, setEstimatedUnitPrice] = useState<number | "">("");

  // Input state
  const [materialName, setMaterialName] = useState("");
  const [existingItems, setExistingItems] = useState<{ id: string; name: string; type: "material" | "tag"; unit?: string }[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  // RFQ sheet state
  const [rfqLineItem, setRfqLineItem] = useState<any | null>(null);
  const [rfqSheetOpen, setRfqSheetOpen] = useState(false);

  const isDraft = indent.status === "DRAFT";

  // Permission checks
  const canSendRfq =
    isWorkspaceAdmin ||
    ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"].includes(workspaceRole || "");
  const canReviewQuotes =
    isWorkspaceAdmin ||
    ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"].includes(workspaceRole || "");

  // Fetch Master Catalog for Combobox
  useEffect(() => {
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
              unit: m.defaultUnit?.abbreviation,
            });
          });
        }

        if (tagData.success && tagData.tags) {
          tagData.tags.forEach((t: any) => {
            items.push({
              id: t.id,
              name: t.name,
              type: "tag",
            });
          });
        }

        // De-duplicate items by case-insensitive name
        const uniqueItems = items.filter(
          (item, index, self) =>
            self.findIndex((i) => i.name.toLowerCase() === item.name.toLowerCase()) === index
        );

        setExistingItems(uniqueItems);
      } catch (error) {
        console.error("Failed to fetch existing tags/materials:", error);
      } finally {
        setIsLoadingCatalog(false);
      }
    };

    if (isDraft) {
      fetchExistingTagsAndMaterials();
    }
  }, [workspaceId, isDraft]);


  const openRfqSheet = (item: any) => {
    setRfqLineItem(item);
    setRfqSheetOpen(true);
  };

  const getLineItemStatusBadge = (status: string) => {
    const configs: Record<string, string> = {
      PENDING: "bg-muted text-muted-foreground border-transparent",
      RFQ_SENT: "bg-orange-50/50 text-orange-600 border-orange-200/50",
      QUOTES_RECEIVED: "bg-sky-50/50 text-sky-600 border-sky-200/50",
      APPROVED: "bg-emerald-50/50 text-emerald-600 border-emerald-200/50",
      PO_CREATED: "bg-violet-50/50 text-violet-600 border-violet-200/50",
      REJECTED: "bg-red-50/50 text-red-600 border-red-200/50",
    };
    const labels: Record<string, string> = {
      PENDING: "Pending",
      RFQ_SENT: "RFQ Sent",
      QUOTES_RECEIVED: "Quotes In",
      APPROVED: "Approved",
      PO_CREATED: "PO Created",
      REJECTED: "Rejected",
    };
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[9px] font-bold uppercase tracking-wide h-5 px-1.5",
          configs[status] ?? ""
        )}
      >
        {labels[status] ?? status}
      </Badge>
    );
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const finalMaterialName = materialName.trim();

    if (!finalMaterialName) {
      toast.error("Please select or enter a material name");
      return;
    }
    if (!unit.trim()) { toast.error("Please enter unit"); return; }
    if (!quantity || Number(quantity) <= 0) { toast.error("Please enter valid quantity"); return; }

    try {
      setIsAdding(true);
      const payload = {
        materialName: finalMaterialName.trim(),
        unit: unit.trim(),
        quantity: Number(quantity),
        estimatedUnitPrice: estimatedUnitPrice
          ? Math.round(Number(estimatedUnitPrice) * 100)
          : undefined,
      };

      const res = await fetch(
        `/api/v1/procurement/indents/${indent.id}/items?w=${workspaceId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add line item");

      const fetchRes = await fetch(
        `/api/v1/procurement/indents/${indent.id}?w=${workspaceId}`
      );
      const fetchJson = await fetchRes.json();
      if (fetchRes.ok && fetchJson.data) onUpdate(fetchJson.data);

      toast.success("Line item added");
      
      // Reset form
      setMaterialName("");
      setUnit("pcs");
      setQuantity("");
      setEstimatedUnitPrice("");
    } catch (err: any) {
      toast.error(err.message || "Failed to add item");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch(
        `/api/v1/procurement/indents/${indent.id}/items/${itemId}?w=${workspaceId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to remove item");

      const fetchRes = await fetch(
        `/api/v1/procurement/indents/${indent.id}?w=${workspaceId}`
      );
      const fetchJson = await fetchRes.json();
      if (fetchRes.ok && fetchJson.data) onUpdate(fetchJson.data);

      toast.success("Line item removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove item");
    }
  };

  const handleLineItemUpdated = async (updatedItem: any) => {
    const fetchRes = await fetch(
      `/api/v1/procurement/indents/${indent.id}?w=${workspaceId}`
    );
    const fetchJson = await fetchRes.json();
    if (fetchRes.ok && fetchJson.data) {
      onUpdate(fetchJson.data);
      const fresh = fetchJson.data.lineItems?.find(
        (li: any) => li.id === rfqLineItem?.id
      );
      if (fresh) setRfqLineItem(fresh);
    }
  };

  const colSpan = isDraft ? 7 : 6;

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5 mb-1">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Materials / Line Items
          </span>
          <span className="text-[10px] text-muted-foreground">
            {(indent.lineItems?.length ?? 0)} item{indent.lineItems?.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="border border-border/80 rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 pl-3 min-w-[200px]">
                  Material
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-16">
                  Unit
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-20">
                  Qty
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-24">
                  Est. ₹
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-24">
                  Status
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-16 text-center">
                  Vendors
                </TableHead>
                {isDraft && (
                  <TableHead className="h-8 w-10" />
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {indent.lineItems && indent.lineItems.length > 0 ? (
                indent.lineItems.map((item: any) => (
                  <TableRow
                    key={item.id}
                    className="hover:bg-muted/10 group cursor-pointer"
                    onClick={() => openRfqSheet(item)}
                  >
                    <TableCell className="py-2.5 pl-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {item.materialName}
                        </span>
                        {item.specifications && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                            <CornerDownRight className="h-2.5 w-2.5 text-muted-foreground/50" />
                            {item.specifications}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="py-2.5 text-xs text-muted-foreground">
                      {item.unit}
                    </TableCell>

                    <TableCell className="py-2.5 text-xs font-bold">
                      {item.quantity.toLocaleString("en-IN")}
                    </TableCell>

                    <TableCell className="py-2.5 text-xs text-muted-foreground">
                      {item.estimatedUnitPrice
                        ? `₹${(item.estimatedUnitPrice / 100).toLocaleString("en-IN")}`
                        : "—"}
                    </TableCell>

                    <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {getLineItemStatusBadge(item.status)}
                      </div>
                    </TableCell>

                    <TableCell
                      className="py-2.5 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <VendorMatchPill
                        lineItemId={item.id}
                        indentId={indent.id}
                        workspaceId={workspaceId}
                        materialName={item.materialName}
                        onClick={() => openRfqSheet(item)}
                      />
                    </TableCell>

                    {isDraft && (
                      <TableCell
                        className="py-2.5 text-right pr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteItem(item.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="text-center py-8 text-xs text-muted-foreground italic"
                  >
                    No line items yet — add a material below
                  </TableCell>
                </TableRow>
              )}

              {/* Inline add row — DRAFT only */}
              {isDraft && (
                <TableRow className="bg-muted/10 border-t border-dashed border-border/60">
                  <TableCell colSpan={colSpan} className="py-2 px-3">
                    <form
                      onSubmit={handleAddItem}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-5 relative">
                        <AutoCompleteInput
                          value={materialName}
                          onChange={setMaterialName}
                          onUnitAutoFill={setUnit}
                          catalog={existingItems}
                          isLoading={isLoadingCatalog}
                          disabled={isAdding}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="Unit"
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          disabled={isAdding}
                          className="h-8 text-xs bg-background px-2"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          placeholder="Qty"
                          value={quantity}
                          onChange={(e) =>
                            setQuantity(e.target.value === "" ? "" : Number(e.target.value))
                          }
                          disabled={isAdding}
                          className="h-8 text-xs bg-background px-2"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          placeholder="Est. ₹"
                          value={estimatedUnitPrice}
                          onChange={(e) =>
                            setEstimatedUnitPrice(
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                          disabled={isAdding}
                          className="h-8 text-xs bg-background px-2"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="submit"
                          disabled={isAdding}
                          size="sm"
                          className="h-8 text-xs font-bold px-2 w-full gap-1"
                        >
                          {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </form>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Click to open RFQ hint */}
        {(indent.lineItems?.length ?? 0) > 0 && (
          <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 px-0.5">
            <ChevronRight className="h-3 w-3" />
            Click any row to open the RFQ panel for that material
          </p>
        )}
      </div>

      {/* RFQ Sheet */}
      <RfqSheet
        open={rfqSheetOpen}
        onClose={() => { setRfqSheetOpen(false); setRfqLineItem(null); }}
        lineItem={rfqLineItem}
        indentId={indent.id}
        workspaceId={workspaceId}
        canSendRfq={canSendRfq}
        canReviewQuotes={canReviewQuotes}
        onLineItemUpdated={handleLineItemUpdated}
      />
    </>
  );
}
