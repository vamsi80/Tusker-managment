"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPaise } from "@tusker/core/lib/procurement/purchase-order";
import { vendorDisplayName } from "@tusker/core/lib/procurement/vendor-name";
import { LENGTH_UNIT_OPTIONS, dimensionsFor, lineTotals, type LengthUnit } from "@tusker/core/lib/procurement/boq";
import { apiJson, toastError, useRateGroups, type Trade } from "../../_components/boq-shared";

export interface BoqLine {
  id: string;
  tradeId: string;
  zoneId: string | null;
  vendorId: string | null;
  capabilityId: string | null;
  description: string;
  unit: string;
  serviceType: string;
  rate: number;
  inputUnit: LengthUnit;
  length: number | null;
  breadth: number | null;
  depth: number | null;
  quantity: number;
  measuredQty: number;
  markupPercent: number;
  wastagePercent: number;
  costAmount: number;
  amount: number;
  notes: string | null;
  trade: { id: string; name: string };
  zone: { id: string; name: string } | null;
  vendor: { id: string; name: string; companyName: string | null } | null;
}

interface RateRow {
  id: string;
  vendorId: string;
  materialName: string;
  unit: string | null;
  rate: number | null;
  serviceType: string;
  tradeId: string | null;
  groupId: string | null;
  /** Prisma Decimal, serialised as a string. */
  wastagePercent: string | number;
  vendor: { id: string; name: string; companyName: string | null };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  boqId: string;
  trades: Trade[];
  zones: { id: string; name: string }[];
  /** Null = adding a new line. */
  line: BoqLine | null;
  /** Prefills a new line, e.g. the group it was added from. */
  defaults?: { tradeId?: string; zoneId?: string | null };
  onSaved: () => void;
}

const NO_ZONE = "__none__";
const ANY_GROUP = "__any__";
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const str = (v: number | null | undefined) => (v == null ? "" : String(v));

/**
 * Department -> (category, to narrow the list) -> contractor (from the rate
 * sheet's contractor list) -> item -> dimensions the item's unit needs ->
 * wastage and markup. Totals preview with the same
 * lineTotals() the API saves with.
 */
export function BoqLineDialog({ open, onOpenChange, workspaceId, boqId, trades, zones, line, defaults, onSaved }: Props) {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);

  const [tradeId, setTradeId] = useState("");
  const [zoneId, setZoneId] = useState(NO_ZONE);
  const [vendorId, setVendorId] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [rate, setRate] = useState(""); // rupees
  const [inputUnit, setInputUnit] = useState<LengthUnit>("mm");
  const [length, setLength] = useState("");
  const [breadth, setBreadth] = useState("");
  const [depth, setDepth] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [markup, setMarkup] = useState("0");
  const [wastage, setWastage] = useState("0");
  const [groupId, setGroupId] = useState(ANY_GROUP);
  const { groups } = useRateGroups(workspaceId);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Contractor rates only: the BOQ is priced from the contractor list.
  useEffect(() => {
    if (!open) return;
    setLoadingRates(true);
    Promise.all([
      apiJson<RateRow[]>(`/api/v1/procurement/rate-sheet?w=${workspaceId}&kind=labour`),
      apiJson<RateRow[]>(`/api/v1/procurement/rate-sheet?w=${workspaceId}&kind=labour_material`),
    ])
      .then(([a, b]) => setRates([...a, ...b]))
      .catch((e) => toastError(e, "Could not load the rate sheet"))
      .finally(() => setLoadingRates(false));
  }, [open, workspaceId]);

  useEffect(() => {
    if (!open) return;
    setTradeId(line?.tradeId ?? defaults?.tradeId ?? "");
    setZoneId(line?.zoneId ?? defaults?.zoneId ?? NO_ZONE);
    setVendorId(line?.vendorId ?? "");
    setCapabilityId(line?.capabilityId ?? "");
    setRate(line ? String(line.rate / 100) : "");
    setInputUnit(line?.inputUnit ?? "mm");
    setLength(str(line?.length));
    setBreadth(str(line?.breadth));
    setDepth(str(line?.depth));
    setQuantity(line ? String(line.quantity) : "1");
    setMarkup(line ? String(line.markupPercent) : "0");
    setWastage(line ? String(line.wastagePercent ?? 0) : "0");
    setGroupId(ANY_GROUP);
    setNotes(line?.notes ?? "");
  }, [open, line, defaults]);

  // Categories of this department, each followed by its subcategories.
  const tradeGroups = useMemo(() => {
    const categories = groups.filter((g) => g.tradeId === tradeId && !g.parentId);
    return categories.flatMap((c) => [c, ...groups.filter((g) => g.parentId === c.id)]);
  }, [groups, tradeId]);
  const tradeRates = useMemo(() => {
    const inTrade = rates.filter((r) => r.tradeId === tradeId);
    if (groupId === ANY_GROUP) return inTrade;
    const inGroup = new Set([groupId, ...groups.filter((g) => g.parentId === groupId).map((g) => g.id)]);
    return inTrade.filter((r) => r.groupId && inGroup.has(r.groupId));
  }, [rates, tradeId, groupId, groups]);
  const contractors = useMemo(() => {
    const seen = new Map<string, RateRow["vendor"]>();
    for (const r of tradeRates) seen.set(r.vendorId, r.vendor);
    return [...seen.values()];
  }, [tradeRates]);
  const items = useMemo(() => tradeRates.filter((r) => r.vendorId === vendorId), [tradeRates, vendorId]);
  const picked = rates.find((r) => r.id === capabilityId);

  // An existing line keeps its copied description and unit even if the rate
  // sheet row has since changed or been removed.
  const unit = picked?.unit || line?.unit || "nos";
  const description = picked?.materialName ?? line?.description ?? "";
  const dims = dimensionsFor(unit);

  const preview = lineTotals({
    rate: Math.round((Number(rate) || 0) * 100),
    rateUnit: unit,
    inputUnit,
    length: num(length),
    breadth: num(breadth),
    depth: num(depth),
    quantity: Number(quantity) || 0,
    wastagePercent: Number(wastage) || 0,
    markupPercent: Number(markup) || 0,
  });

  const pickItem = (id: string) => {
    setCapabilityId(id);
    const row = rates.find((r) => r.id === id);
    if (row) {
      setRate(row.rate != null ? String(row.rate / 100) : "");
      setWastage(String(Number(row.wastagePercent) || 0));
    }
  };

  const save = async () => {
    if (!tradeId) return toast.error("Choose a department");
    if (!capabilityId && !line) return toast.error("Choose an item from the rate sheet");
    const missing = (dims.length && !num(length)) || (dims.breadth && !num(breadth)) || (dims.depth && !num(depth));
    if (missing) return toast.error(`Enter the ${[dims.length && "length", dims.breadth && "breadth", dims.depth && "depth"].filter(Boolean).join(", ")}`);
    if (!(Number(quantity) > 0)) return toast.error("Quantity must be above zero");
    const wastagePercent = Number(wastage) || 0;
    if (wastagePercent < 0 || wastagePercent > 100) return toast.error("Wastage must be between 0 and 100%");

    const body = {
      tradeId,
      zoneId: zoneId === NO_ZONE ? null : zoneId,
      capabilityId: capabilityId || null,
      vendorId: vendorId || null,
      rate: Math.round((Number(rate) || 0) * 100),
      inputUnit,
      length: dims.length ? num(length) : null,
      breadth: dims.breadth ? num(breadth) : null,
      depth: dims.depth ? num(depth) : null,
      quantity: Number(quantity),
      markupPercent: Number(markup) || 0,
      wastagePercent,
      notes: notes.trim() || null,
    };

    setSaving(true);
    try {
      const base = `/api/v1/procurement/boq/${boqId}/lines`;
      if (line) await apiJson(`${base}/${line.id}?w=${workspaceId}`, { method: "PATCH", json: body });
      else await apiJson(`${base}?w=${workspaceId}`, { method: "POST", json: body });
      toast.success(line ? "Line updated" : "Line added");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toastError(e, "Could not save the line");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{line ? "Edit line" : "Add line"}</DialogTitle>
          <DialogDescription>Rates come from the rate sheet&apos;s contractor list. The rate can be adjusted for this BOQ.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Department</label>
            <Select
              value={tradeId}
              onValueChange={(v) => {
                setTradeId(v);
                setGroupId(ANY_GROUP);
                setVendorId("");
                setCapabilityId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Carpentry, electrical..." />
              </SelectTrigger>
              <SelectContent>
                {trades.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Space / zone</label>
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ZONE}>No zone</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tradeGroups.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={groupId}
                onValueChange={(v) => {
                  setGroupId(v);
                  setVendorId("");
                  setCapabilityId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_GROUP}>All categories</SelectItem>
                  {tradeGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className={g.parentId ? "pl-4 text-muted-foreground" : "font-medium"}>{g.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Contractor</label>
            <Select
              value={vendorId}
              onValueChange={(v) => {
                setVendorId(v);
                setCapabilityId("");
              }}
              disabled={!tradeId || loadingRates}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingRates
                      ? "Loading..."
                      : contractors.length
                        ? "Choose a contractor"
                        : groupId === ANY_GROUP
                          ? "No contractor rates for this department"
                          : "No contractor rates in this category"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {contractors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {vendorDisplayName(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Item</label>
            <Select value={capabilityId} onValueChange={pickItem} disabled={!vendorId}>
              <SelectTrigger>
                <SelectValue placeholder={line && !picked ? description : "Choose an item"} />
              </SelectTrigger>
              <SelectContent>
                {items.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="capitalize">{r.materialName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.rate != null ? formatPaise(r.rate) : "no rate"} / {r.unit || "unit"}
                      {r.serviceType === "LABOUR_WITH_MATERIAL" ? " · labour + material" : " · labour"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Rate (₹ per {unit})</label>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Markup %</label>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </div>
        </div>

        {(dims.length || dims.breadth || dims.depth) && (
          <div className="grid gap-4 sm:grid-cols-4 items-end">
            {dims.length && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Length</label>
                <Input type="number" min="0" step="any" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} />
              </div>
            )}
            {dims.breadth && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Breadth / height</label>
                <Input type="number" min="0" step="any" inputMode="decimal" value={breadth} onChange={(e) => setBreadth(e.target.value)} />
              </div>
            )}
            {dims.depth && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Depth</label>
                <Input type="number" min="0" step="any" inputMode="decimal" value={depth} onChange={(e) => setDepth(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Measured in</label>
              <Select value={inputUnit} onValueChange={(v) => setInputUnit(v as LengthUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LENGTH_UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium">Quantity</label>
            <Input type="number" min="0" step="any" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Wastage %</label>
            <Input type="number" min="0" max="100" step="0.5" inputMode="decimal" value={wastage} onChange={(e) => setWastage(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Finish, spec, location detail..." />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm grid grid-cols-3 gap-2">
          <div>
            <div className="text-muted-foreground">Measured</div>
            <div className="font-medium tabular-nums">
              {preview.measuredQty.toLocaleString("en-IN", { maximumFractionDigits: 4 })} {unit}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Cost{Number(wastage) ? ` (incl. ${Number(wastage)}% wastage)` : ""}</div>
            <div className="font-medium tabular-nums">{formatPaise(preview.costAmount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total with markup</div>
            <div className="font-semibold tabular-nums">{formatPaise(preview.amount)}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {line ? "Save" : "Add line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
