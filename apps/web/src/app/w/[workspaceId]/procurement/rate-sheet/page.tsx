"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, FolderTree, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { can } from "@tusker/core/lib/constants/capabilities";
import { formatPaise } from "@tusker/core/lib/procurement/purchase-order";
import { vendorDisplayName } from "@tusker/core/lib/procurement/vendor-name";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { NoAccess, apiJson, groupPath, toastError, useRateGroups, useRateUnits, useTrades } from "../_components/boq-shared";
import { RateGroupsDialog } from "./_components/rate-groups-dialog";

// Radix Select can't hold an empty value.
const NONE = "__none__";

type Kind = "material" | "labour" | "labour_material";
const SERVICE: Record<Kind, "SUPPLY" | "LABOUR" | "LABOUR_WITH_MATERIAL"> = {
  material: "SUPPLY",
  labour: "LABOUR",
  labour_material: "LABOUR_WITH_MATERIAL",
};

interface RateRow {
  id: string;
  vendorId: string;
  materialName: string;
  unit: string | null;
  rate: number | null;
  link: string | null;
  tradeId: string | null;
  trade: { id: string; name: string } | null;
  groupId: string | null;
  /** Prisma Decimal, serialised as a string. */
  wastagePercent: string | number;
  vendor: { id: string; name: string; companyName: string | null; vendorType: string; verificationStatus: string };
}

type Draft = {
  id?: string;
  vendorId: string;
  materialName: string;
  unit: string;
  rate: string;
  tradeId: string;
  link: string;
  categoryId: string;
  subcategoryId: string;
  wastage: string;
};
const EMPTY_DRAFT: Draft = {
  vendorId: "",
  materialName: "",
  unit: "nos",
  rate: "",
  tradeId: "",
  link: "",
  categoryId: NONE,
  subcategoryId: NONE,
  wastage: "",
};
const NEW_TRADE = "__new__";

const isHttpLink = (link: string | null) => /^https?:\/\//i.test(link || "");

export default function RateSheetPage() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const { data, isLoading: layoutLoading } = useWorkspaceLayout();
  const canView = can(data.permissions.capabilities, "ratesheet:view");
  const canEdit = can(data.permissions.capabilities, "ratesheet:edit");

  const [section, setSection] = useState<"materials" | "contractors">("materials");
  const [contractorKind, setContractorKind] = useState<Exclude<Kind, "material">>("labour");
  const kind: Kind = section === "materials" ? "material" : contractorKind;
  const isContractor = kind !== "material";

  const [tradeFilter, setTradeFilter] = useState("all");
  const [rows, setRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  const { trades, addTrade } = useTrades(workspaceId);
  const units = useRateUnits(workspaceId);
  const { groups, reload: reloadGroups } = useRateGroups(workspaceId);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [groupsOpen, setGroupsOpen] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [newTradeName, setNewTradeName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const trade = isContractor && tradeFilter !== "all" ? `&tradeId=${tradeFilter}` : "";
      setRows(await apiJson<RateRow[]>(`/api/v1/procurement/rate-sheet?w=${workspaceId}&kind=${kind}${trade}`));
    } catch (e) {
      toastError(e, "Could not load the rate sheet");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, kind, isContractor, tradeFilter]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  useEffect(() => {
    if (!canEdit) return;
    apiJson<any[]>(`/api/v1/procurement/vendors?w=${workspaceId}&status=ACTIVE`).then(setVendors).catch(() => {});
  }, [canEdit, workspaceId]);

  // Suppliers for the material list, contractors for the contractor lists;
  // everyone else is still pickable underneath, since the line is not strict.
  const vendorOptions = useMemo(() => {
    const wanted = isContractor ? "CONTRACTOR" : "SUPPLIER";
    return [...vendors].sort(
      (a, b) => Number((b.vendorType || "SUPPLIER") === wanted) - Number((a.vendorType || "SUPPLIER") === wanted)
    );
  }, [vendors, isContractor]);

  // Categories belong to one list: the material list (null) or one department.
  // "All departments" spans several lists, so it gets no category filter.
  const listTradeId: string | null | undefined = !isContractor ? null : tradeFilter !== "all" ? tradeFilter : undefined;
  const categoriesOf = (tradeId: string | null | undefined) =>
    tradeId === undefined ? [] : groups.filter((g) => g.tradeId === tradeId && !g.parentId);
  const listCategories = categoriesOf(listTradeId);
  const activeCategory = listCategories.some((c) => c.id === categoryFilter) ? categoryFilter : "all";
  const shownRows =
    activeCategory === "all"
      ? rows
      : rows.filter((r) => r.groupId === activeCategory || groups.find((g) => g.id === r.groupId)?.parentId === activeCategory);

  // The dialog's list follows the department picked in it.
  const draftTradeId: string | null | undefined = !isContractor
    ? null
    : draft.tradeId && draft.tradeId !== NEW_TRADE
      ? draft.tradeId
      : undefined;
  const draftCategories = categoriesOf(draftTradeId);
  const draftSubcategories = groups.filter((g) => g.parentId === draft.categoryId);

  const openAdd = () => {
    setDraft({
      ...EMPTY_DRAFT,
      tradeId: isContractor && tradeFilter !== "all" ? tradeFilter : "",
      categoryId: activeCategory !== "all" ? activeCategory : NONE,
    });
    setNewTradeName("");
    setDialogOpen(true);
  };

  const splitGroup = (groupId: string | null) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return { categoryId: NONE, subcategoryId: NONE };
    return group.parentId ? { categoryId: group.parentId, subcategoryId: group.id } : { categoryId: group.id, subcategoryId: NONE };
  };

  const openEdit = (row: RateRow) => {
    setDraft({
      id: row.id,
      vendorId: row.vendorId,
      materialName: row.materialName,
      unit: row.unit || "nos",
      rate: row.rate != null ? String(row.rate / 100) : "",
      tradeId: row.tradeId || "",
      link: row.link || "",
      ...splitGroup(row.groupId),
      wastage: Number(row.wastagePercent) ? String(Number(row.wastagePercent)) : "",
    });
    setNewTradeName("");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.vendorId) return toast.error(isContractor ? "Choose a contractor" : "Choose a supplier");
    if (!draft.materialName.trim()) return toast.error("Enter the item name");
    const rupees = Number(draft.rate);
    if (!draft.rate || !Number.isFinite(rupees) || rupees <= 0) return toast.error("Enter a rate above zero");
    const wastage = Number(draft.wastage || 0);
    if (!Number.isFinite(wastage) || wastage < 0 || wastage > 100) return toast.error("Wastage must be between 0 and 100%");

    setSaving(true);
    try {
      let tradeId: string | null = draft.tradeId || null;
      if (isContractor && tradeId === NEW_TRADE) {
        if (!newTradeName.trim()) throw new Error("Enter the new department's name");
        tradeId = (await addTrade(newTradeName.trim())).id;
      }
      if (isContractor && !tradeId) throw new Error("Choose a department");

      const body = {
        materialName: draft.materialName.trim(),
        unit: draft.unit,
        serviceType: SERVICE[kind],
        rate: Math.round(rupees * 100),
        link: draft.link.trim() || null,
        tradeId: isContractor ? tradeId : null,
        // A department created just now has no categories yet.
        groupId: draftTradeId === undefined ? null : [draft.subcategoryId, draft.categoryId].find((id) => id !== NONE) ?? null,
        wastagePercent: wastage,
      };
      const base = `/api/v1/procurement/vendors/${draft.vendorId}/capabilities`;
      if (draft.id) {
        await apiJson(`${base}/${draft.id}?w=${workspaceId}`, { method: "PATCH", json: body });
      } else {
        await apiJson(`${base}?w=${workspaceId}`, { method: "POST", json: body });
      }
      toast.success(draft.id ? "Rate updated" : "Rate added");
      setDialogOpen(false);
      load();
    } catch (e) {
      toastError(e, "Could not save the rate");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: RateRow) => {
    if (!confirm(`Remove "${row.materialName}" from ${vendorDisplayName(row.vendor)}'s rates?`)) return;
    try {
      await apiJson(`/api/v1/procurement/vendors/${row.vendorId}/capabilities/${row.id}?w=${workspaceId}`, { method: "DELETE" });
      toast.success("Rate removed");
      setRows((list) => list.filter((r) => r.id !== row.id));
    } catch (e) {
      toastError(e, "Could not remove the rate");
    }
  };

  const columns: ColumnDef<RateRow>[] = [
    {
      accessorKey: "materialName",
      header: "Item",
      cell: ({ row }) => <span className="font-medium capitalize">{row.original.materialName}</span>,
    },
    {
      id: "vendor",
      accessorFn: (r) => vendorDisplayName(r.vendor),
      header: isContractor ? "Contractor" : "Supplier",
      cell: ({ row }) => (
        <Link href={`/w/${workspaceId}/vendors/${row.original.vendorId}`} className="hover:underline">
          {vendorDisplayName(row.original.vendor)}
          {row.original.vendor.verificationStatus === "VERIFIED" && (
            <Badge variant="outline" className="ml-2 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              Verified
            </Badge>
          )}
        </Link>
      ),
    },
    ...(isContractor
      ? [
          {
            id: "trade",
            accessorFn: (r: RateRow) => r.trade?.name ?? "",
            header: "Department",
            cell: ({ row }: { row: { original: RateRow } }) => row.original.trade?.name ?? <span className="text-muted-foreground">—</span>,
          } as ColumnDef<RateRow>,
        ]
      : []),
    {
      id: "category",
      accessorFn: (r) => groupPath(groups, r.groupId),
      header: "Category",
      cell: ({ getValue }) => (getValue() as string) || <span className="text-muted-foreground">—</span>,
    },
    { accessorKey: "unit", header: "Unit", cell: ({ row }) => row.original.unit || "—" },
    {
      accessorKey: "rate",
      header: () => <div className="text-right">Rate</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {row.original.rate != null ? `${formatPaise(row.original.rate)} / ${row.original.unit || "unit"}` : "—"}
        </div>
      ),
    },
    {
      id: "wastage",
      accessorFn: (r) => Number(r.wastagePercent),
      header: () => <div className="text-right">Wastage</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {Number(row.original.wastagePercent) ? `${Number(row.original.wastagePercent)}%` : <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: "link",
      header: "Reference",
      cell: ({ row }) =>
        isHttpLink(row.original.link) ? (
          <a href={row.original.link!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-ink hover:underline">
            Open <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(canEdit
      ? [
          {
            id: "actions",
            header: () => <div className="text-right">Actions</div>,
            cell: ({ row }: { row: { original: RateRow } }) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row.original)} aria-label="Edit rate">
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => remove(row.original)} aria-label="Remove rate">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ),
          } as ColumnDef<RateRow>,
        ]
      : []),
  ];

  if (layoutLoading) return null;
  if (!canView) return <NoAccess what="the rate sheet" />;

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)}>
          <TabsList>
            <TabsTrigger value="materials">Material list</TabsTrigger>
            <TabsTrigger value="contractors">Contractor list</TabsTrigger>
          </TabsList>
        </Tabs>
        {isContractor && (
          <>
            <Tabs value={contractorKind} onValueChange={(v) => setContractorKind(v as typeof contractorKind)}>
              <TabsList>
                <TabsTrigger value="labour">Labour</TabsTrigger>
                <TabsTrigger value="labour_material">Labour + Material</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={tradeFilter} onValueChange={setTradeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {trades.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        {listTradeId !== undefined && listCategories.length > 0 && (
          <Select value={activeCategory} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {listCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {listTradeId !== undefined && canEdit && (
          <Button variant="outline" size="sm" onClick={() => setGroupsOpen(true)}>
            <FolderTree className="mr-2 size-4" /> Categories
          </Button>
        )}
      </div>

      <DataTable
        fillViewport
        columns={columns}
        data={shownRows}
        isLoading={loading}
        enableGlobalFilter
        searchPlaceholder="Search item, supplier, contractor..."
        onAdd={canEdit ? openAdd : undefined}
        addButtonLabel="Add rate"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit rate" : "Add rate"}</DialogTitle>
            <DialogDescription>
              {kind === "material" ? "Material list" : kind === "labour" ? "Contractor list · Labour" : "Contractor list · Labour + Material"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{isContractor ? "Contractor" : "Supplier"}</label>
              <Select value={draft.vendorId} onValueChange={(v) => setDraft({ ...draft, vendorId: v })} disabled={Boolean(draft.id)}>
                <SelectTrigger>
                  <SelectValue placeholder={isContractor ? "Choose a contractor" : "Choose a supplier"} />
                </SelectTrigger>
                <SelectContent>
                  {vendorOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {vendorDisplayName(v)}
                      <span className="ml-2 text-xs text-muted-foreground capitalize">{(v.vendorType || "SUPPLIER").toLowerCase()}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isContractor && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Department</label>
                <Select value={draft.tradeId} onValueChange={(v) => setDraft({ ...draft, tradeId: v, categoryId: NONE, subcategoryId: NONE })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Carpentry, electrical..." />
                  </SelectTrigger>
                  <SelectContent>
                    {trades.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_TRADE}>+ New department</SelectItem>
                  </SelectContent>
                </Select>
                {draft.tradeId === NEW_TRADE && (
                  <Input value={newTradeName} onChange={(e) => setNewTradeName(e.target.value)} placeholder="Department name" />
                )}
              </div>
            )}

            {draftCategories.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={draft.categoryId} onValueChange={(v) => setDraft({ ...draft, categoryId: v, subcategoryId: NONE })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {draftCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subcategory</label>
                  <Select
                    value={draft.subcategoryId}
                    onValueChange={(v) => setDraft({ ...draft, subcategoryId: v })}
                    disabled={draftSubcategories.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {draftSubcategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Item</label>
              <Input
                value={draft.materialName}
                onChange={(e) => setDraft({ ...draft, materialName: e.target.value })}
                placeholder={isContractor ? "e.g. Base cabinet 600mm deep" : "e.g. 18mm BWP plywood"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rate (₹)</label>
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Per unit</label>
                <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.abbreviation} value={u.abbreviation}>
                        {u.abbreviation} <span className="text-xs text-muted-foreground">· {u.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Wastage % (optional)</label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                inputMode="decimal"
                value={draft.wastage}
                onChange={(e) => setDraft({ ...draft, wastage: e.target.value })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Added to the cost of BOQ lines that use this rate, before markup.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reference link (optional)</label>
              <Input value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} placeholder="https://..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {draft.id ? "Save" : "Add rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {listTradeId !== undefined && (
        <RateGroupsDialog
          open={groupsOpen}
          onOpenChange={setGroupsOpen}
          workspaceId={workspaceId}
          tradeId={listTradeId}
          listLabel={isContractor ? `Contractor list · ${trades.find((t) => t.id === listTradeId)?.name ?? "Department"}` : "Material list"}
          groups={groups}
          onChanged={reloadGroups}
        />
      )}
    </div>
  );
}
