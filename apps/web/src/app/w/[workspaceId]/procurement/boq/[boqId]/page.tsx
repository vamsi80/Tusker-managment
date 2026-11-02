"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, Loader2, MapPin, Pencil, Plus, RefreshCw, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@tusker/core/lib/constants/capabilities";
import { formatPaise } from "@tusker/core/lib/procurement/purchase-order";
import { vendorDisplayName } from "@tusker/core/lib/procurement/vendor-name";
import { groupLines, type BoqStatus } from "@tusker/core/lib/procurement/boq";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { NoAccess, apiJson, toastError, useTrades } from "../../_components/boq-shared";
import { BoqStatusBadge } from "../_components/boq-status-badge";
import { BoqLineDialog, type BoqLine } from "../_components/boq-line-dialog";
import { BoqZonesDialog } from "../_components/boq-zones-dialog";

interface BoqDetail {
  id: string;
  name: string;
  revision: number;
  status: BoqStatus;
  project: { id: string; name: string; slug: string; boqZones: { id: string; name: string }[] };
  lines: BoqLine[];
  revisions: { id: string; revision: number; status: BoqStatus }[];
  revisedFrom: { id: string; revision: number } | null;
}

type View = "department" | "zone";
const NO_ZONE_KEY = "__none__";

const size = (l: BoqLine) => {
  const parts = [l.length, l.breadth, l.depth].filter((v): v is number => v != null);
  return parts.length ? `${parts.join(" × ")} ${l.inputUnit}` : "—";
};
const qty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 4 });

export default function BoqDetailPage() {
  const { workspaceId, boqId } = useParams() as { workspaceId: string; boqId: string };
  const router = useRouter();
  const { data, isLoading: layoutLoading } = useWorkspaceLayout();
  const caps = data.permissions.capabilities;
  const canView = can(caps, "boq:view");
  const canEdit = can(caps, "boq:edit");
  const canApprove = can(caps, "boq:approve");

  const [boq, setBoq] = useState<BoqDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("department");
  const [lineDialog, setLineDialog] = useState<{ line: BoqLine | null; defaults?: { tradeId?: string; zoneId?: string | null } } | null>(null);
  const [zonesOpen, setZonesOpen] = useState(false);
  const { trades } = useTrades(workspaceId);

  const load = useCallback(async () => {
    try {
      setBoq(await apiJson<BoqDetail>(`/api/v1/procurement/boq/${boqId}?w=${workspaceId}`));
    } catch (e) {
      toastError(e, "Could not load the BOQ");
    } finally {
      setLoading(false);
    }
  }, [boqId, workspaceId]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const groups = useMemo(() => {
    if (!boq) return [];
    return groupLines(boq.lines, (l) => (view === "department" ? l.tradeId : l.zoneId ?? NO_ZONE_KEY));
  }, [boq, view]);

  const totals = useMemo(() => {
    const cost = boq?.lines.reduce((s, l) => s + l.costAmount, 0) ?? 0;
    const amount = boq?.lines.reduce((s, l) => s + l.amount, 0) ?? 0;
    return { cost, amount, markup: amount - cost };
  }, [boq]);

  const action = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      await load();
    } catch (e) {
      toastError(e, "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: BoqStatus, done: string) =>
    action(() => apiJson(`/api/v1/procurement/boq/${boqId}/status?w=${workspaceId}`, { method: "POST", json: { status } }), done);

  const revise = async () => {
    setBusy(true);
    try {
      const next = await apiJson<{ id: string }>(`/api/v1/procurement/boq/${boqId}/revise?w=${workspaceId}`, { method: "POST" });
      toast.success("New revision started");
      router.push(`/w/${workspaceId}/procurement/boq/${next.id}`);
    } catch (e) {
      toastError(e, "Could not start a revision");
      setBusy(false);
    }
  };

  const removeBoq = async () => {
    if (!confirm("Delete this draft BOQ and all its lines?")) return;
    setBusy(true);
    try {
      await apiJson(`/api/v1/procurement/boq/${boqId}?w=${workspaceId}`, { method: "DELETE" });
      router.push(`/w/${workspaceId}/procurement/boq`);
    } catch (e) {
      toastError(e, "Could not delete the BOQ");
      setBusy(false);
    }
  };

  /** Pull every rate-sheet line up to today's rates. Rate edits already do this live; this catches older drafts. */
  const refreshRates = async () => {
    setBusy(true);
    try {
      const { updated } = await apiJson<{ updated: number }>(`/api/v1/procurement/boq/${boqId}/refresh-rates?w=${workspaceId}`, {
        method: "POST",
      });
      toast.success(updated ? `${updated} line${updated === 1 ? "" : "s"} moved to today's rates` : "Already on today's rates");
      await load();
    } catch (e) {
      toastError(e, "Could not refresh rates");
    } finally {
      setBusy(false);
    }
  };

  const removeLine = (line: BoqLine) => {
    if (!confirm(`Remove "${line.description}"?`)) return;
    action(() => apiJson(`/api/v1/procurement/boq/${boqId}/lines/${line.id}?w=${workspaceId}`, { method: "DELETE" }), "Line removed");
  };

  if (layoutLoading) return null;
  if (!canView) return <NoAccess what="BOQs" />;
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-primary-ink" />
      </div>
    );
  }
  if (!boq) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        BOQ not found. <Link href={`/w/${workspaceId}/procurement/boq`} className="underline">Back to BOQs</Link>
      </div>
    );
  }

  const isDraft = boq.status === "DRAFT";
  const editable = isDraft && canEdit;
  const zones = boq.project.boqZones;
  const nextRevision = boq.revisions.find((r) => r.status !== "SUPERSEDED") ?? boq.revisions[0];

  const groupLabel = (key: string) =>
    view === "department"
      ? trades.find((t) => t.id === key)?.name ?? boq.lines.find((l) => l.tradeId === key)?.trade.name ?? "Department"
      : key === NO_ZONE_KEY
        ? "No zone"
        : zones.find((z) => z.id === key)?.name ?? "Zone";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href={`/w/${workspaceId}/procurement/boq`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> BOQs
          </Link>
          <h2 className="text-xl font-semibold flex flex-wrap items-center gap-2">
            {boq.name}
            <span className="text-muted-foreground font-normal">R{boq.revision}</span>
            <BoqStatusBadge status={boq.status} />
          </h2>
          <p className="text-sm text-muted-foreground">
            <Link href={`/w/${workspaceId}/p/${boq.project.slug}`} className="hover:underline">
              {boq.project.name}
            </Link>
            {boq.revisedFrom && (
              <>
                {" · revised from "}
                <Link href={`/w/${workspaceId}/procurement/boq/${boq.revisedFrom.id}`} className="underline">
                  R{boq.revisedFrom.revision}
                </Link>
              </>
            )}
            {boq.status === "SUPERSEDED" && nextRevision && (
              <>
                {" · replaced by "}
                <Link href={`/w/${workspaceId}/procurement/boq/${nextRevision.id}`} className="underline">
                  R{nextRevision.revision}
                </Link>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isDraft && canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={removeBoq} disabled={busy}>
                <Trash2 className="mr-1.5 size-4" /> Delete
              </Button>
              <Button size="sm" onClick={() => setStatus("SUBMITTED", "Submitted for approval")} disabled={busy || boq.lines.length === 0}>
                <Send className="mr-1.5 size-4" /> Submit
              </Button>
            </>
          )}
          {boq.status === "SUBMITTED" && canEdit && (
            <Button variant="outline" size="sm" onClick={() => setStatus("DRAFT", "Moved back to draft")} disabled={busy}>
              <Undo2 className="mr-1.5 size-4" /> Back to draft
            </Button>
          )}
          {boq.status === "SUBMITTED" && canApprove && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStatus("REJECTED", "BOQ rejected")} disabled={busy}>
                <XCircle className="mr-1.5 size-4" /> Reject
              </Button>
              <Button size="sm" onClick={() => setStatus("APPROVED", "BOQ approved")} disabled={busy}>
                <CheckCircle2 className="mr-1.5 size-4" /> Approve
              </Button>
            </>
          )}
          {boq.status === "REJECTED" && canEdit && (
            <Button variant="outline" size="sm" onClick={() => setStatus("DRAFT", "Reopened as draft")} disabled={busy}>
              <Undo2 className="mr-1.5 size-4" /> Reopen draft
            </Button>
          )}
          {["SUBMITTED", "APPROVED", "REJECTED"].includes(boq.status) && canEdit && (
            <Button variant="outline" size="sm" onClick={revise} disabled={busy}>
              <Copy className="mr-1.5 size-4" /> New revision
            </Button>
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          ["Cost price", totals.cost],
          ["Markup", totals.markup],
          ["Total", totals.amount],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{formatPaise(value as number)}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="department">By department</TabsTrigger>
            <TabsTrigger value="zone">By space / zone</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setZonesOpen(true)}>
            <MapPin className="mr-1.5 size-4" /> Zones ({zones.length})
          </Button>
          {editable && boq.lines.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={refreshRates}
              disabled={busy}
              title="Re-copy item names, units and rates from the rate sheet"
            >
              <RefreshCw className="mr-1.5 size-4" /> Refresh rates
            </Button>
          )}
          {editable && (
            <Button size="sm" onClick={() => setLineDialog({ line: null })}>
              <Plus className="mr-1.5 size-4" /> Add line
            </Button>
          )}
        </div>
      </div>

      {!isDraft && (
        <p className="text-xs text-muted-foreground">
          Only a draft can be changed. {canEdit ? "Start a new revision to make changes." : ""}
        </p>
      )}

      {/* Grouped lines */}
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No lines yet.{editable ? " Add the first one from the rate sheet." : ""}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
              <span className="font-semibold">{groupLabel(group.key)}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums">{formatPaise(group.amount)}</span>
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      setLineDialog({
                        line: null,
                        defaults:
                          view === "department"
                            ? { tradeId: group.key }
                            : { zoneId: group.key === NO_ZONE_KEY ? null : group.key },
                      })
                    }
                  >
                    <Plus className="mr-1 size-3.5" /> Line
                  </Button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>{view === "department" ? "Zone" : "Department"}</TableHead>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Measured</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Markup</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {editable && <TableHead className="w-21" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium capitalize">
                        {l.description}
                        {l.notes && <div className="text-xs font-normal normal-case text-muted-foreground">{l.notes}</div>}
                      </TableCell>
                      <TableCell>{view === "department" ? l.zone?.name ?? "—" : l.trade.name}</TableCell>
                      <TableCell>{l.vendor ? vendorDisplayName(l.vendor) : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{size(l)}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(l.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {qty(l.measuredQty)} {l.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatPaise(l.rate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPaise(l.costAmount)}
                        {l.wastagePercent > 0 && <div className="text-xs text-muted-foreground">incl. {l.wastagePercent}% wastage</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.markupPercent}%</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatPaise(l.amount)}</TableCell>
                      {editable && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => setLineDialog({ line: l })} aria-label="Edit line">
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => removeLine(l)} disabled={busy} aria-label="Remove line">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={7}>Subtotal</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(group.costAmount)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{formatPaise(group.amount)}</TableCell>
                    {editable && <TableCell />}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        ))
      )}

      <BoqLineDialog
        open={Boolean(lineDialog)}
        onOpenChange={(open) => !open && setLineDialog(null)}
        workspaceId={workspaceId}
        boqId={boq.id}
        trades={trades}
        zones={zones}
        line={lineDialog?.line ?? null}
        defaults={lineDialog?.defaults}
        onSaved={load}
      />
      <BoqZonesDialog
        open={zonesOpen}
        onOpenChange={setZonesOpen}
        workspaceId={workspaceId}
        projectId={boq.project.id}
        zones={zones}
        canEdit={canEdit}
        onChanged={load}
      />
    </div>
  );
}
