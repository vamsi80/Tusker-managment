"use client";

import { useState } from "react";
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
import { Trash2, Plus, CornerDownRight, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VendorMatchPill } from "./vendor-match-pill";
import { RfqSheet } from "./rfq-sheet";

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
  const [materialName, setMaterialName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [quantity, setQuantity] = useState<number | "">("");
  const [estimatedUnitPrice, setEstimatedUnitPrice] = useState<number | "">("");

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
    if (!materialName.trim()) { toast.error("Please enter material name"); return; }
    if (!unit.trim()) { toast.error("Please enter unit"); return; }
    if (!quantity || Number(quantity) <= 0) { toast.error("Please enter valid quantity"); return; }

    try {
      setIsAdding(true);
      const payload = {
        materialName: materialName.trim(),
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

  // Refresh a single line item in the indent after RFQ action
  const handleLineItemUpdated = async (updatedItem: any) => {
    // Refetch full indent to get latest state
    const fetchRes = await fetch(
      `/api/v1/procurement/indents/${indent.id}?w=${workspaceId}`
    );
    const fetchJson = await fetchRes.json();
    if (fetchRes.ok && fetchJson.data) {
      onUpdate(fetchJson.data);
      // Keep rfqLineItem in sync
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
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 pl-3">
                  Material
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-12">
                  Unit
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-14">
                  Qty
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-20">
                  Est. ₹
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-24">
                  Status
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8 w-12 text-center">
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
                      <div className="col-span-4">
                        <Input
                          placeholder="Material / service name…"
                          value={materialName}
                          onChange={(e) => setMaterialName(e.target.value)}
                          disabled={isAdding}
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="Unit"
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          disabled={isAdding}
                          className="h-8 text-xs bg-background"
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
                          className="h-8 text-xs bg-background"
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
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Button
                          type="submit"
                          disabled={isAdding}
                          size="sm"
                          className="h-8 text-xs font-bold px-3 gap-1"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add
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
