"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BUYER_COMPANIES,
  buyerLabel,
  isBuyerConfigured,
  formatPaise,
  isIntraState,
  poTotals,
  PO_TERMS,
  rupeesInWords,
  type CompanyCode,
} from "@tusker/core/lib/procurement/purchase-order";

type Row = { description: string; unit: string; quantity: string; rate: string; taxPercent: string };

type Vendor = {
  id: string;
  name: string | null;
  companyName: string | null;
  gstNumber: string | null;
};

type IndentOption = { id: string; indentId: string | null; name: string; status: string };

const emptyRow = (): Row => ({
  description: "",
  unit: "Nos",
  quantity: "1",
  rate: "",
  taxPercent: "18",
});

/**
 * Default delivery address: the buying entity's own premises, name first. The
 * printed PO shows the company name above the address in that block, so it has
 * to be part of the editable text rather than hardcoded into the document.
 */
const companyAddress = (company: CompanyCode) =>
  [BUYER_COMPANIES[company].name, ...BUYER_COMPANIES[company].addressLines].join("\n");

const toPaise = (rupees: string) => Math.round(Number(rupees || 0) * 100);

export function CreatePurchaseOrderForm() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const preselectedIndent = useSearchParams().get("indentId");

  const [company, setCompany] = useState<CompanyCode>("WT");
  const [poDate, setPoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState(() => companyAddress("WT"));
  // Once the user edits the address, switching entity stops overwriting their text.
  const [addressTouched, setAddressTouched] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [indentId, setIndentId] = useState(preselectedIndent ?? "");
  const [terms, setTerms] = useState(PO_TERMS.join("\n"));
  // Extras approved on the indent. Prefilled from it, editable before raising.
  const [exciseDutyPercent, setExciseDutyPercent] = useState("");
  const [vatPercent, setVatPercent] = useState("");
  const [transportCharge, setTransportCharge] = useState("");
  const [labourCharge, setLabourCharge] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [indents, setIndents] = useState<IndentOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!addressTouched) setDeliveryAddress(companyAddress(company));
  }, [company, addressTouched]);

  useEffect(() => {
    fetch(`/api/v1/procurement/vendors?w=${workspaceId}&status=ACTIVE`)
      .then((res) => res.json())
      .then((body) => setVendors(body.data ?? []))
      .catch(() => toast.error("Could not load vendors"));

    fetch(`/api/v1/procurement/indents?w=${workspaceId}`)
      .then((res) => res.json())
      .then((body) =>
        setIndents((body.data ?? []).filter((indent: IndentOption) => indent.status === "APPROVED"))
      )
      .catch(() => toast.error("Could not load indents"));
  }, [workspaceId]);

  /** Pull the approved item list and its rates straight off the indent. */
  const loadIndent = async (id: string) => {
    setIndentId(id);
    if (!id) return;

    const res = await fetch(`/api/v1/procurement/indents/${id}?w=${workspaceId}`);
    const { data } = await res.json();
    if (!data) {
      toast.error("Could not load that indent");
      return;
    }

    setRows(
      (data.lineItems ?? []).map((item: any) => ({
        description: [item.materialName, item.specifications].filter(Boolean).join(" - "),
        unit: item.unit ?? "Nos",
        quantity: String(item.quantity ?? 1),
        rate: ((item.finalUnitPrice ?? item.estimatedUnitPrice ?? 0) / 100).toFixed(2),
        taxPercent: "18",
      }))
    );

    // Carry the approved extras across so the ordered figure matches the
    // approved one. They stay editable before the PO is raised.
    const percent = (value: unknown) => (Number(value) > 0 ? String(Number(value)) : "");
    const rupees = (paise: unknown) => (Number(paise) > 0 ? (Number(paise) / 100).toFixed(2) : "");
    setExciseDutyPercent(percent(data.exciseDutyPercent));
    setVatPercent(percent(data.vatPercent));
    setTransportCharge(rupees(data.transportCharge));
    setLabourCharge(rupees(data.labourCharge));

    const vendor = data.selectedVendorId ?? data.lineItems?.[0]?.approvedQuote?.vendorId ?? "";
    if (vendor) setVendorId(vendor);
    if (data.indentId) setReferenceNo((current) => current || data.indentId);
  };

  /**
   * An indent's "Create PO" button links here with ?indentId=..., which seeds the
   * dropdown but never fires its onValueChange - so without this the form opened
   * with the indent named and no items or rates behind it.
   */
  const hydratedFromQuery = useRef(false);
  useEffect(() => {
    if (hydratedFromQuery.current || !preselectedIndent) return;
    hydratedFromQuery.current = true;
    loadIndent(preselectedIndent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedIndent, workspaceId]);

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const vendor = vendors.find((v) => v.id === vendorId);
  const buyer = BUYER_COMPANIES[company];

  const totals = useMemo(
    () =>
      poTotals(
        rows.map((row) => ({
          quantity: Number(row.quantity || 0),
          rate: toPaise(row.rate),
          taxPercent: Number(row.taxPercent || 0),
        })),
        isIntraState(buyer.gstNumber, vendor?.gstNumber),
        {
          exciseDutyPercent: Number(exciseDutyPercent) || null,
          vatPercent: Number(vatPercent) || null,
          transportCharge: toPaise(transportCharge) || null,
          labourCharge: toPaise(labourCharge) || null,
        }
      ),
    [
      rows,
      buyer.gstNumber,
      vendor?.gstNumber,
      exciseDutyPercent,
      vatPercent,
      transportCharge,
      labourCharge,
    ]
  );

  const submit = async () => {
    const items = rows
      .filter((row) => row.description.trim())
      .map((row) => ({
        description: row.description.trim(),
        unit: row.unit.trim() || "Nos",
        quantity: Number(row.quantity || 0),
        rate: toPaise(row.rate),
        taxPercent: Number(row.taxPercent || 0),
      }));

    if (!vendorId) {
      toast.error("Select a vendor");
      return;
    }
    if (!items.length) {
      toast.error("Add at least one line item");
      return;
    }
    if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      toast.error("Every line needs a whole quantity above zero");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/procurement/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          company,
          vendorId,
          indentId: indentId || null,
          referenceNo: referenceNo.trim() || null,
          poDate,
          deliveryAddress: deliveryAddress.trim(),
          exciseDutyPercent: Number(exciseDutyPercent) || null,
          vatPercent: Number(vatPercent) || null,
          transportCharge: toPaise(transportCharge) || null,
          labourCharge: toPaise(labourCharge) || null,
          terms: terms
            .split("\n")
            .map((term) => term.trim())
            .filter(Boolean),
          items,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not create the purchase order");

      toast.success(`Purchase order ${body.data.poNumber} created`);
      router.push(`/w/${workspaceId}/procurement/pos/${body.data.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase order details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Buying entity</label>
            <Select value={company} onValueChange={(value) => setCompany(value as CompanyCode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BUYER_COMPANIES).map((entity) => (
                  <SelectItem
                    key={entity.code}
                    value={entity.code}
                    disabled={!isBuyerConfigured(entity.code)}
                  >
                    {buyerLabel(entity.code)} ({entity.code})
                    {!isBuyerConfigured(entity.code) && " - not set up yet"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Numbered from {company}&apos;s own series, e.g. {company}/26-27/0064.
            </p>
            {!isBuyerConfigured(company) && (
              <p className="text-xs text-destructive">
                {buyerLabel(company)} has no registered address or GSTIN on file,
                so its purchase orders would print an empty buyer block.
              </p>
            )}
            {isBuyerConfigured(company) && buyer.brand && (
              <p className="text-xs text-muted-foreground">
                Invoices as {buyer.name}.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Indent</label>
            <Select
              value={indentId || "none"}
              onValueChange={(value) => loadIndent(value === "none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Load items from an approved indent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No indent</SelectItem>
                {indents.map((indent) => (
                  <SelectItem key={indent.id} value={indent.id}>
                    {indent.indentId ? `${indent.indentId} - ` : ""}
                    {indent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Vendor (purchase from)
            </label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.companyName || v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vendor?.gstNumber && (
              <p className="text-xs text-muted-foreground">GSTIN: {vendor.gstNumber}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reference no</label>
            <Input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="PI-2026-317"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Delivery address</label>
            <Textarea
              rows={4}
              value={deliveryAddress}
              onChange={(e) => {
                setAddressTouched(true);
                setDeliveryAddress(e.target.value);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Items</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, emptyRow()])}>
            <Plus className="size-3.5" /> Add row
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left">
                <th className="w-[40%]">Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Rate (₹)</th>
                <th>GST %</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="[&>td]:px-2 [&>td]:py-1 align-top">
                  <td>
                    <Input
                      value={row.description}
                      onChange={(e) => setRow(index, { description: e.target.value })}
                      placeholder="ESP 32 N16.R8"
                    />
                  </td>
                  <td>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => setRow(index, { quantity: e.target.value })}
                      className="w-20"
                    />
                  </td>
                  <td>
                    <Input
                      value={row.unit}
                      onChange={(e) => setRow(index, { unit: e.target.value })}
                      className="w-20"
                    />
                  </td>
                  <td>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.rate}
                      onChange={(e) => setRow(index, { rate: e.target.value })}
                      className="w-28"
                    />
                  </td>
                  <td>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={row.taxPercent}
                      onChange={(e) => setRow(index, { taxPercent: e.target.value })}
                      className="w-20"
                    />
                  </td>
                  <td className="pt-3 text-right tabular-nums">
                    {formatPaise(totals.lines[index]?.amount ?? 0)}
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
                      disabled={rows.length === 1}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              { label: "Excise duty %", value: exciseDutyPercent, set: setExciseDutyPercent, hint: "% of sub total" },
              { label: "VAT %", value: vatPercent, set: setVatPercent, hint: "% of sub total" },
              { label: "Transportation", value: transportCharge, set: setTransportCharge, hint: "flat amount" },
              { label: "Labour", value: labourCharge, set: setLabourCharge, hint: "flat amount" },
            ].map((field) => (
              <div key={field.label} className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={field.value}
                  onChange={(e) => field.set(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">{field.hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 ml-auto w-full max-w-xs text-sm tabular-nums">
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Sub total</span>
              <span>{formatPaise(totals.subtotal)}</span>
            </div>
            {totals.chargeRows.map((row) => (
              <div key={row.label} className="flex justify-between py-0.5">
                <span className="text-muted-foreground">{row.label}</span>
                <span>{formatPaise(row.value)}</span>
              </div>
            ))}
            {totals.taxRows.map((row) =>
              totals.igst ? (
                <div key={row.percent} className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">IGST @ {row.percent}%</span>
                  <span>{formatPaise(row.amount)}</span>
                </div>
              ) : (
                <div key={row.percent}>
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">CGST @ {row.percent / 2}%</span>
                    <span>{formatPaise(row.half)}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">SGST @ {row.percent / 2}%</span>
                    <span>{formatPaise(row.half)}</span>
                  </div>
                </div>
              )
            )}
            {totals.roundOff !== 0 && (
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Round off</span>
                <span>{formatPaise(totals.roundOff)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span>{formatPaise(totals.grandTotal)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{rupeesInWords(totals.grandTotal)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Payment terms &amp; conditions</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setTerms(PO_TERMS.join("\n"))}>
            Reset to standard
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={8}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            className="text-xs"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            One term per line - they print numbered on the PO, exactly as written here.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-8">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Creating..." : "Create purchase order"}
        </Button>
      </div>
    </div>
  );
}
