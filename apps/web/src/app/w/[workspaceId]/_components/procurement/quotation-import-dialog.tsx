"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  extractQuotation,
  parseQuotationGrid,
  QUOTATION_FIELD_LABELS,
  QUOTATION_ACCEPT,
  unmappedHeaders,
  type ColumnMapping,
  type QuotationCandidate,
  type QuotationField,
  type QuotationItem,
} from "@/lib/procurement/quotation";
import {
  applySavedMapping,
  identifyVendor,
  readSavedMapping,
  toSavedMapping,
  type VendorLike,
} from "@/lib/procurement/quotation/vendor";

export type ImportedItem = {
  itemName: string;
  description?: string;
  quantity: number | null;
  unit?: string;
  unitPrice: number | null;
};

const FIELD_OPTIONS: (QuotationField | "ignore")[] = [
  "ignore", "itemName", "description", "quantity", "unit", "unitPrice", "amount",
];

const money = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Upload → review → import. The dialog never saves anything: it hands confirmed
 * rows back to the indent form, which the user still submits themselves.
 */
export function QuotationImportDialog({
  open,
  onOpenChange,
  workspaceId,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImport: (items: ImportedItem[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<QuotationCandidate[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [rows, setRows] = useState<QuotationItem[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});

  const [vendors, setVendors] = useState<VendorLike[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [rememberMapping, setRememberMapping] = useState(false);
  const [mappingEdited, setMappingEdited] = useState(false);

  const active = useMemo(
    () => candidates.find((c) => c.label === activeLabel) ?? candidates[0],
    [candidates, activeLabel]
  );

  // Vendors are needed to recognise a repeat quotation and to offer the mapping
  // memory; a failure here only costs that convenience, so it is not surfaced.
  useEffect(() => {
    if (!open) return;
    fetch(`/api/v1/procurement/vendors?w=${workspaceId}&status=ACTIVE`)
      .then((res) => res.json())
      .then((data) => setVendors(data?.success ? data.data : []))
      .catch(() => setVendors([]));
  }, [open, workspaceId]);

  const reset = useCallback(() => {
    setCandidates([]); setRows([]); setMapping({}); setActiveLabel("");
    setError(null); setStage(null); setVendorId(""); setRememberMapping(false); setMappingEdited(false);
  }, []);

  const handleFile = async (file: File) => {
    reset();
    setStage("Reading quotation");
    try {
      const { candidates: found } = await extractQuotation(file, { onProgress: setStage });

      // A vendor we recognise may already have told us how to read their columns.
      const best = found[0];
      const identified = identifyVendor({ vendorName: best.vendorName, gstNumber: best.gstNumber }, vendors);
      if (identified.vendor) setVendorId(identified.vendor.id);

      // A vendor we recognise may already have told us how to read their columns.
      const saved = identified.vendor ? readSavedMapping(identified.vendor.quotationMapping) : null;
      let resolved = found;

      if (saved && best.headers.length) {
        const applied = applySavedMapping(best.headers, saved);
        if (Object.keys(applied).length >= 2) {
          setStage("Applying saved mapping");
          const reparsed = parseQuotationGrid(best.grid, { mapping: applied, fromOcr: best.fromOcr });
          if (reparsed.items.length) resolved = [{ ...best, ...reparsed }, ...found.slice(1)];
        }
      }

      setCandidates(resolved);
      setActiveLabel(resolved[0].label);
      setRows(resolved[0].items);
      setMapping(resolved[0].mapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that quotation");
    } finally {
      setStage(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  /** Re-runs the parse when the user corrects a column, so the preview stays honest. */
  const remap = (field: QuotationField | "ignore", columnIndex: number) => {
    if (!active) return;
    const next: ColumnMapping = { ...mapping };
    for (const [key, value] of Object.entries(next)) {
      if (value === columnIndex) delete next[key as QuotationField];
    }
    if (field !== "ignore") next[field] = columnIndex;

    setMapping(next);
    setMappingEdited(true);
    setRows(parseQuotationGrid(active.grid, { mapping: next, fromOcr: active.fromOcr }).items);
  };

  const selectCandidate = (label: string) => {
    const candidate = candidates.find((c) => c.label === label);
    if (!candidate) return;
    setActiveLabel(label);
    setRows(candidate.items);
    setMapping(candidate.mapping);
  };

  const updateRow = (index: number, patch: Partial<QuotationItem>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch, warnings: [], status: "valid" } : row)));

  const importable = rows.filter((row) => row.itemName.trim() && (row.quantity ?? 0) > 0);
  const warningCount = rows.reduce((n, row) => n + row.warnings.length, 0);

  const handleImport = async () => {
    if (!importable.length) {
      toast.error("Nothing to import — every row needs a name and a quantity");
      return;
    }

    if (rememberMapping && vendorId && active) {
      // Best-effort: the import must not fail because the memory could not be saved.
      await fetch(`/api/v1/procurement/vendors/${vendorId}/quotation-mapping?w=${workspaceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: toSavedMapping(active.headers, mapping) }),
      }).catch(() => toast.error("Items imported, but the column mapping could not be remembered"));
    }

    onImport(
      importable.map((row) => ({
        itemName: row.itemName.trim(),
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unitPrice,
      }))
    );
    onOpenChange(false);
    reset();
  };

  const unmapped = active ? unmappedHeaders(active.headers, mapping) : [];
  const needsMapping = active ? mapping.itemName === undefined || mapping.unitPrice === undefined : false;

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import items from a quotation</DialogTitle>
        </DialogHeader>

        {!active && (
          <div className="flex flex-col items-center gap-3 py-10">
            <input
              ref={inputRef}
              type="file"
              accept={QUOTATION_ACCEPT}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={stage !== null}>
              {stage ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileUp className="mr-2 size-4" />}
              {stage ? `${stage}…` : "Choose quotation file"}
            </Button>
            <p className="text-xs text-muted-foreground">Excel, CSV, PDF, Word, or a photo of the quotation</p>
            {error && <p className="max-w-md text-center text-xs text-destructive">{error}</p>}
          </div>
        )}

        {active && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium">{active.vendorName || "Unknown supplier / contractor"}</span>
              {active.quotationNumber && (
                <span className="text-muted-foreground">Quotation: {active.quotationNumber}</span>
              )}
              <span className="text-muted-foreground">{rows.length} items detected</span>
              {candidates.length > 1 && (
                <select
                  value={activeLabel}
                  onChange={(e) => selectCandidate(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {candidates.map((c) => (
                    <option key={c.label} value={c.label}>{c.label} ({c.items.length} items)</option>
                  ))}
                </select>
              )}
            </div>

            {active.warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {warning}
              </p>
            ))}

            {(needsMapping || unmapped.length > 0) && (
              <div className="rounded-md border p-2">
                <p className="mb-2 text-xs font-medium">
                  {needsMapping ? "Some columns were not recognised — map them below" : "Unrecognised columns"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(needsMapping ? active.headers.map((header, index) => ({ header, index })) : unmapped)
                    .filter(({ header }) => header.trim() !== "")
                    .map(({ header, index }) => {
                      const current = (Object.entries(mapping).find(([, i]) => i === index)?.[0] ?? "ignore") as
                        QuotationField | "ignore";
                      return (
                        <label key={index} className="flex items-center gap-1.5 text-xs">
                          <span className="max-w-[10rem] truncate text-muted-foreground">{header}</span>
                          <span aria-hidden>→</span>
                          <select
                            value={current}
                            onChange={(e) => remap(e.target.value as QuotationField | "ignore", index)}
                            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                          >
                            {FIELD_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option === "ignore" ? "Ignore" : QUOTATION_FIELD_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/60">
                  <TableRow>
                    <TableHead className="w-[36%]">Item</TableHead>
                    <TableHead className="w-[10%]">Qty</TableHead>
                    <TableHead className="w-[10%]">Unit</TableHead>
                    <TableHead className="w-[14%]">Rate</TableHead>
                    <TableHead className="w-[14%]">Amount</TableHead>
                    <TableHead className="w-[8%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={index} className={row.status === "error" ? "bg-destructive/5" : undefined}>
                      <TableCell>
                        <Input
                          value={row.itemName}
                          onChange={(e) => updateRow(index, { itemName: e.target.value })}
                          className="h-7 text-xs"
                        />
                        {row.warnings.map((warning) => (
                          <p key={warning} className="mt-1 text-[11px] text-amber-700">⚠ {warning}</p>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.quantity ?? ""}
                          onChange={(e) => updateRow(index, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                          className="h-7 text-xs"
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.unit ?? ""}
                          onChange={(e) => updateRow(index, { unit: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.unitPrice ?? ""}
                          onChange={(e) => updateRow(index, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })}
                          className="h-7 text-xs"
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {money(row.quantity !== null && row.unitPrice !== null ? row.quantity * row.unitPrice : row.amount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    setRows((current) => [
                      ...current,
                      { itemName: "", quantity: 1, unitPrice: null, amount: null, sourceRow: 0, status: "valid", warnings: [] },
                    ])
                  }
                >
                  <Plus className="mr-1 size-3" /> Add row
                </Button>
                {warningCount > 0 && <span className="text-amber-700">Warnings: {warningCount}</span>}

                {/* Offered only once we know which vendor to remember it against. */}
                {mappingEdited && vendors.length > 0 && (
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={rememberMapping}
                      onCheckedChange={(checked) => setRememberMapping(checked === true)}
                    />
                    Remember this mapping for
                    <select
                      value={vendorId}
                      onChange={(e) => setVendorId(e.target.value)}
                      className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                    >
                      <option value="">select supplier / contractor…</option>
                      {vendors.map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>{vendor.companyName || vendor.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
                <Button size="sm" onClick={handleImport} disabled={!importable.length}>
                  Import {importable.length} item{importable.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
