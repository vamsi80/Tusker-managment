"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Check, X, Send, FolderKanban, Truck, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";
import { vendorDisplayName } from "@/lib/procurement/vendor-name";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  areStatusFiltersEqual,
  MATERIAL_STATUS_OPTIONS,
  parseProcurementStatusParam,
} from "@/lib/procurement/status-filters";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface LineItemRow {
  id: string;
  materialId?: string | null;
  materialName: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice?: number | null;
  finalUnitPrice?: number | null;
  specifications?: string;
  status: string;
  rfqDeadline?: string | null;
  vendor?: {
    id: string;
    name: string;
    companyName?: string | null;
  } | null;
  indent: {
    id: string;
    indentId: string | null;
    name: string;
    status: string;
    rejectedStage?: string | null;
    project: Project;
    selectedVendor?: {
      id: string;
      name: string;
      companyName?: string | null;
    } | null;
    expectedDelivery?: string | null;
    requestedBy?: {
      id: string;
      user: {
        id: string;
        surname?: string | null;
      };
    } | null;
  };
  quotesCount: number;
  hasApprovedQuote: boolean;
}

interface MaterialsHubClientProps {
  workspaceId: string;
  projects: Project[];
}

interface GroupedMaterialRow {
  groupKey: string;
  catalogId?: string | null;
  materialId?: string | null;
  materialName: string;
  unit: string;
  combinedQuantity: number;
  statuses: string[];
  items: LineItemRow[];
  projectsCount?: number;
  vendorCount?: number;
  latestPrice?: number | null;
  vendor?: {
    id: string;
    name: string;
    companyName?: string | null;
  } | null;
}

const MATERIAL_STATUSES = MATERIAL_STATUS_OPTIONS.map((option) => option.value);

export function MaterialsHubClient({
  workspaceId,
  projects,
}: MaterialsHubClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const { data: workspaceData } = useWorkspaceLayout();
  const workspaceRole = workspaceData?.permissions?.workspaceRole;
  const workspaceMemberId = workspaceData?.permissions?.workspaceMemberId;
  const isWorkspaceAdmin = workspaceData?.permissions?.isWorkspaceAdmin;
  const isApprover = workspaceRole === "OWNER" || workspaceRole === "ADMIN" || workspaceRole === "MANAGER";
  const isAccounts = workspaceRole === "ACCOUNTS";
  const canManageMaterial = Boolean(
    isWorkspaceAdmin ||
    workspaceRole === "OWNER" ||
    workspaceRole === "ADMIN" ||
    workspaceRole === "MANAGER" ||
    workspaceRole === "PROCUREMENT" ||
    (!isAccounts && workspaceRole)
  );

  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [catalogMaterials, setCatalogMaterials] = useState<any[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

  // Edit material state & double confirmation
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editMaterialName, setEditMaterialName] = useState("");
  const [editMaterialUnit, setEditMaterialUnit] = useState("");
  const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);
  const [isUpdatingMaterial, setIsUpdatingMaterial] = useState(false);

  // Delete material state & double confirmation
  const [isDeleteStep1Open, setIsDeleteStep1Open] = useState(false);
  const [isDeleteStep2Open, setIsDeleteStep2Open] = useState(false);
  const [isDeletingMaterial, setIsDeletingMaterial] = useState(false);

  // Edit quantity states
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Filters
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>(() =>
    parseProcurementStatusParam(statusParam, MATERIAL_STATUSES),
  );

  const handleStatusFilterChange = (values: string[]) => {
    setStatusFilter(values);
    const params = new URLSearchParams(searchParams.toString());
    if (values.length > 0) params.set("status", values.join(","));
    else params.delete("status");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Loading states
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [vendorCoverages, setVendorCoverages] = useState<any[]>([]);

  const fetchVendorCoverages = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors/materials/coverage?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setVendorCoverages(data.data);
      }
    } catch (e) {
      console.error("Failed to load vendor coverages", e);
    }
  }, [workspaceId]);

  const fetchLineItems = useCallback(async () => {
    setIsLoadingItems(true);
    try {
      const params = new URLSearchParams({ w: workspaceId });
      if (projectFilter.length > 0) params.set("projectId", JSON.stringify(projectFilter));
      if (statusFilter.length > 0) params.set("status", JSON.stringify(statusFilter));
      const url = `/api/v1/procurement/indents/line-items?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setLineItems(data.data);
      }
    } catch (e) {
      toast.error("Failed to load materials");
    } finally {
      setIsLoadingItems(false);
    }
  }, [workspaceId, projectFilter, statusFilter]);

  const handleSaveQuantity = async (item: LineItemRow) => {
    if (!editQty || parseFloat(editQty) <= 0) {
      toast.error("Please enter a valid positive quantity");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/v1/procurement/indents/${item.indent.id}/items/${item.id}?w=${workspaceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: parseFloat(editQty) }),
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success("Quantity updated successfully");
        setEditingItemId(null);
        fetchLineItems();
      } else {
        toast.error(data.error || "Failed to update quantity");
      }
    } catch (e) {
      toast.error("Request failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitIndent = async (indentId: string) => {
    try {
      const res = await fetch(
        `/api/v1/procurement/indents/${indentId}/submit?w=${workspaceId}`,
        {
          method: "POST",
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success("Indent submitted successfully");
        fetchLineItems();
      } else {
        toast.error(data.error || "Failed to submit indent");
      }
    } catch (e) {
      toast.error("Request failed");
    }
  };

  const handleApproveIndent = async (indentId: string) => {
    try {
      const res = await fetch(
        `/api/v1/procurement/indents/${indentId}/approve?w=${workspaceId}`,
        {
          method: "POST",
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success("Indent approved successfully");
        fetchLineItems();
      } else {
        toast.error(data.error || "Failed to approve indent");
      }
    } catch (e) {
      toast.error("Request failed");
    }
  };

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/materials?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setCatalogMaterials(data.data);
      }
    } catch (e) {
      console.error("Failed to load catalog", e);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchLineItems();
    fetchVendorCoverages();
    fetchCatalog();
  }, [fetchLineItems, fetchVendorCoverages, fetchCatalog]);

  // Real-time listener for materials synchronization
  useEffect(() => {
    const handleRealtimeSync = (e: any) => {
      const detail = e.detail || {};
      const action = detail.action || detail.record?.action;
      if (
        action === "MATERIAL_UPDATED" ||
        action === "MATERIAL_DELETED" ||
        action === "MATERIAL_CREATED"
      ) {
        fetchCatalog();
        fetchLineItems();
      }
    };
    window.addEventListener("realtime-sync-refresh", handleRealtimeSync);
    return () => window.removeEventListener("realtime-sync-refresh", handleRealtimeSync);
  }, [fetchCatalog, fetchLineItems]);

  useEffect(() => {
    const nextStatuses = parseProcurementStatusParam(statusParam, MATERIAL_STATUSES);
    setStatusFilter((currentStatuses) =>
      areStatusFiltersEqual(currentStatuses, nextStatuses) ? currentStatuses : nextStatuses,
    );
  }, [statusParam]);

  // Group line items client-side by materialName (case insensitive) and unit
  const groupedItemsMap: Record<string, GroupedMaterialRow> = {};

  // Seed with catalog materials
  catalogMaterials.forEach((cat) => {
    const key = `${cat.name.toLowerCase().trim()}_${(cat.defaultUnit?.abbreviation || "").toLowerCase().trim()}`;
    groupedItemsMap[key] = {
      groupKey: key,
      catalogId: cat.id,
      materialId: cat.materialId,
      materialName: cat.name,
      unit: cat.defaultUnit?.abbreviation || "",
      combinedQuantity: 0,
      statuses: [],
      items: [],
      latestPrice: cat.lastPrice ?? null,
      vendor: cat.vendor ?? null,
    };
  });

  lineItems.forEach((item) => {
    const key = `${item.materialName.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
    const matchingCat = catalogMaterials.find(
      (c) =>
        (item.materialId && c.materialId === item.materialId) ||
        c.name.toLowerCase().trim() === item.materialName.toLowerCase().trim()
    );
    if (!groupedItemsMap[key]) {
      groupedItemsMap[key] = {
        groupKey: key,
        catalogId: matchingCat?.id ?? null,
        materialId: item.materialId || matchingCat?.materialId || null,
        materialName: item.materialName,
        unit: item.unit,
        combinedQuantity: 0,
        statuses: [],
        items: [],
        latestPrice: null,
        vendor: null,
      };
    } else if (!groupedItemsMap[key].catalogId && matchingCat?.id) {
      groupedItemsMap[key].catalogId = matchingCat.id;
      if (!groupedItemsMap[key].materialId && matchingCat.materialId) {
        groupedItemsMap[key].materialId = matchingCat.materialId;
      }
    }
    groupedItemsMap[key].combinedQuantity += item.quantity;
    groupedItemsMap[key].items.push(item);
    if (!groupedItemsMap[key].statuses.includes(item.status)) {
      groupedItemsMap[key].statuses.push(item.status);
    }
  });

  const groupedMaterials: GroupedMaterialRow[] = Object.values(groupedItemsMap).map((group) => {
    const distinctProjects = new Set(
      group.items
        .map((i) => i.indent?.project?.id)
        .filter(Boolean)
    );
    const projectsCount = distinctProjects.size;

    const coverage = vendorCoverages.find(
      (c) => c.materialName.toLowerCase().trim() === group.materialName.toLowerCase().trim()
    );
    const vendorCount = coverage ? coverage.vendorCount : 0;

    // Resolve latest price and offering vendor
    let latestPrice = group.latestPrice ?? null;
    let vendor = group.vendor ?? null;

    if (latestPrice == null) {
      const itemWithFinal = group.items.find((i) => i.finalUnitPrice != null);
      if (itemWithFinal && itemWithFinal.finalUnitPrice != null) {
        latestPrice = itemWithFinal.finalUnitPrice;
        vendor = itemWithFinal.vendor ?? null;
      } else {
        const itemWithEst = group.items.find((i) => i.estimatedUnitPrice != null);
        if (itemWithEst && itemWithEst.estimatedUnitPrice != null) {
          latestPrice = itemWithEst.estimatedUnitPrice;
          vendor = itemWithEst.vendor ?? null;
        }
      }
    }

    return {
      ...group,
      projectsCount,
      vendorCount,
      latestPrice,
      vendor,
    };
  });

  // ponytail: arrange materials in ascending order by materialId
  groupedMaterials.sort((a, b) => {
    const idA = a.materialId || "";
    const idB = b.materialId || "";
    if (idA && idB) {
      return idA.localeCompare(idB, undefined, { numeric: true });
    }
    if (idA) return -1;
    if (idB) return 1;
    return a.materialName.localeCompare(b.materialName);
  });

  const selectedGroup = selectedGroupKey
    ? groupedMaterials.find((g) => g.groupKey === selectedGroupKey) ?? groupedItemsMap[selectedGroupKey]
    : null;

  const handleOpenEdit = () => {
    if (!selectedGroup) return;
    setEditMaterialName(selectedGroup.materialName);
    setEditMaterialUnit(selectedGroup.unit || "");
    setIsEditDialogOpen(true);
  };

  const handleProceedToEditConfirm = () => {
    if (!editMaterialName.trim()) {
      toast.error("Material name cannot be empty");
      return;
    }
    setIsEditConfirmOpen(true);
  };

  const handleUpdateMaterial = async () => {
    if (!selectedGroup) return;
    const targetId = selectedGroup.catalogId || selectedGroup.materialId;
    if (!targetId) {
      toast.error("Unable to identify catalog material to update");
      return;
    }

    const trimmedName = editMaterialName.trim();
    const trimmedUnit = editMaterialUnit.trim() || null;

    setIsUpdatingMaterial(true);
    try {
      const res = await fetch(`/api/v1/materials/${encodeURIComponent(targetId)}?w=${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          unit: trimmedUnit,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update material");
      }

      toast.success("Material updated successfully");

      // Optimistic update of local catalog state
      setCatalogMaterials((prev) =>
        prev.map((m) =>
          m.id === targetId || m.materialId === targetId
            ? {
                ...m,
                name: trimmedName,
                defaultUnit: trimmedUnit ? { abbreviation: trimmedUnit } : null,
              }
            : m
        )
      );

      // Update selectedGroupKey if name or unit changed
      const newKey = `${trimmedName.toLowerCase().trim()}_${(trimmedUnit || "").toLowerCase().trim()}`;
      setSelectedGroupKey(newKey);

      setIsEditConfirmOpen(false);
      setIsEditDialogOpen(false);

      fetchCatalog();
      fetchLineItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to update material");
    } finally {
      setIsUpdatingMaterial(false);
    }
  };

  const handleOpenDelete = () => {
    if (!selectedGroup) return;
    setIsDeleteStep1Open(true);
  };

  const handleProceedToDeleteStep2 = () => {
    setIsDeleteStep1Open(false);
    setIsDeleteStep2Open(true);
  };

  const handleDeleteMaterial = async () => {
    if (!selectedGroup) return;
    const targetId = selectedGroup.catalogId || selectedGroup.materialId;
    if (!targetId) {
      toast.error("Unable to identify catalog material to delete");
      return;
    }

    setIsDeletingMaterial(true);
    try {
      const res = await fetch(`/api/v1/materials/${encodeURIComponent(targetId)}?w=${workspaceId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete material");
      }

      const freedCode = data.data?.materialId || selectedGroup.materialId;
      toast.success(
        freedCode
          ? `Material deleted. Code ${freedCode} freed for reuse.`
          : "Material deleted successfully"
      );

      // Optimistically remove from catalogMaterials
      setCatalogMaterials((prev) =>
        prev.filter((m) => m.id !== targetId && m.materialId !== targetId)
      );

      setIsDeleteStep2Open(false);
      setIsDeleteStep1Open(false);
      setSelectedGroupKey(null);

      fetchCatalog();
      fetchLineItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete material");
    } finally {
      setIsDeletingMaterial(false);
    }
  };

  const getIndentStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline" className="bg-neutral-100 text-neutral-800 border-neutral-300 font-medium">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">Manager Request Review</Badge>;
      case "ASSIGNED":
        return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 font-medium">Assigned</Badge>;
      case "PENDING_OWNER_APPROVAL":
      case "PENDING_OWNER_COMPARATIVE_APPROVAL":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-medium">Owner Request Review</Badge>;
      case "COMPARATIVES_IN_PROGRESS":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-medium">Comparatives</Badge>;
      case "PENDING_MANAGER_FINAL_RATE_APPROVAL":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">Manager Price Review</Badge>;
      case "PENDING_OWNER_FINAL_APPROVAL":
        return <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 font-medium">Awaiting Price Approval</Badge>;
      case "REJECTED":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-medium">Rejected</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">Approved</Badge>;
      case "CANCELLED":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-medium">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Columns for the grouped materials table
  const materialColumns: ColumnDef<GroupedMaterialRow>[] = [
    {
      accessorKey: "materialId",
      header: "Material ID",
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.original.materialId || "—"}
        </span>
      ),
    },
    {
      accessorKey: "materialName",
      header: "Material Name",
      cell: ({ row }) => (
        <span className="text-xs font-semibold text-foreground">
          {row.original.materialName}
        </span>
      ),
    },
    {
      id: "latestPrice",
      header: "Latest Price & Vendor",
      cell: ({ row }) => {
        const price = row.original.latestPrice;
        const vendor = row.original.vendor;
        // The company we bought from, not the proprietor behind it.
        const vendorName = vendor ? vendorDisplayName(vendor, "") : "";

        if (price == null) {
          return (
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground/60 font-mono">—</span>
              {vendorName && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                  {vendorName}
                </span>
              )}
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-mono font-bold text-foreground">
                {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(price / 100)}
              </span>
              {row.original.unit && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  /{row.original.unit}
                </span>
              )}
            </div>
            {vendorName ? (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Truck className="size-3 text-muted-foreground/70 shrink-0" />
                <span className="truncate max-w-[160px] font-medium" title={vendorName}>
                  {vendorName}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground/50">No vendor recorded</span>
            )}
          </div>
        );
      },
    },
    {
      id: "combinedQuantity",
      header: "Required Material",
      cell: ({ row }) => (
        <span className="text-xs font-mono font-bold text-foreground">
          {row.original.combinedQuantity} {row.original.unit}
        </span>
      ),
    },
    {
      id: "projectsCount",
      header: "Projects Using",
      cell: ({ row }) => {
        const count = row.original.projectsCount || 0;
        return (
          <div className="flex items-center gap-1.5">
            <FolderKanban className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">
              {count}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {count === 1 ? "project" : "projects"}
            </span>
          </div>
        );
      },
    },
    {
      id: "vendorCount",
      header: "Suppliers / Contractors Providing",
      cell: ({ row }) => {
        const count = row.original.vendorCount || 0;
        return (
          <div className="flex items-center gap-1.5">
            <Truck className="size-3.5 text-muted-foreground" />
            {count > 0 ? (
              <Badge variant="outline" className="bg-emerald-50/55 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800 text-[11px] font-semibold px-2 py-0.5">
                {count} {count === 1 ? "supplier / contractor" : "suppliers / contractors"}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-neutral-50 text-neutral-400 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-500 dark:border-neutral-800 text-[11px] font-medium px-2 py-0.5">
                0 suppliers / contractors
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">Action</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            size="sm"
            onClick={() => setSelectedGroupKey(row.original.groupKey)}
            className="h-7 text-xs px-2.5 flex items-center gap-1 ml-auto"
          >
            <Eye className="size-3.5" /> Manage
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4">
      {/* Search Filters Row */}
      <div className="flex shrink-0 flex-col items-stretch gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Label className="text-xs font-bold text-muted-foreground uppercase shrink-0">Project:</Label>
          <MultiSelectFilter
            selected={projectFilter}
            onChange={setProjectFilter}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            placeholder="All Projects"
            searchPlaceholder="Search projects..."
            triggerClassName="h-8 w-full text-xs sm:w-[180px]"
          />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Label className="text-xs font-bold text-muted-foreground uppercase shrink-0">Status:</Label>
          <MultiSelectFilter
            selected={statusFilter}
            onChange={handleStatusFilterChange}
            options={MATERIAL_STATUS_OPTIONS}
            placeholder="All Statuses"
            searchPlaceholder="Search statuses..."
            triggerClassName="h-8 w-full text-xs sm:w-[160px]"
          />
        </div>
      </div>

      {/* Main DataTable list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <DataTable
          columns={materialColumns}
          data={groupedMaterials}
          searchKey="materialName"
          searchPlaceholder="Search materials..."
          isLoading={isLoadingItems}
          showPagination={true}
          showColumnToggle={true}
          getRowClassName={(row) => {
            const isGroupApproved = row.original?.items?.some(
              (item: any) => item.indent?.status === "APPROVED"
            );
            return !isGroupApproved ? "opacity-60 bg-muted/20" : "";
          }}
        />
      </div>

      {/* Sliding detail Sheet */}
      <Sheet open={!!selectedGroupKey} onOpenChange={(open) => { if (!open) setSelectedGroupKey(null); }}>
        <SheetContent className="sm:max-w-[700px] overflow-y-auto flex flex-col gap-6 p-6">
          {selectedGroup && (
            <>
              <SheetHeader className="p-0 border-b pb-4 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      {selectedGroup.materialId && (
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {selectedGroup.materialId}
                        </span>
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                        Consolidated Material Overview
                      </span>
                    </div>
                    <SheetTitle className="text-base font-bold text-foreground">
                      {selectedGroup.materialName}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground mt-1">
                      Required in <strong className="text-foreground">{selectedGroup.items.length} {selectedGroup.items.length === 1 ? 'project' : 'projects'}</strong> | Combined total: <strong className="text-foreground">{selectedGroup.combinedQuantity} {selectedGroup.unit}</strong>
                    </SheetDescription>
                    {selectedGroup.latestPrice != null && (
                      <div className="flex flex-wrap items-center gap-2 mt-2.5 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border/70 text-xs w-fit">
                        <span className="text-muted-foreground text-[11px] font-medium">Latest Price:</span>
                        <span className="font-mono font-bold text-foreground text-xs">
                          {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(selectedGroup.latestPrice / 100)}
                          {selectedGroup.unit ? ` / ${selectedGroup.unit}` : ""}
                        </span>
                        {vendorDisplayName(selectedGroup.vendor, "") && (
                          <>
                            <span className="text-muted-foreground/40">•</span>
                            <span className="text-muted-foreground text-[11px]">Offered by:</span>
                            <span className="font-medium text-foreground text-xs flex items-center gap-1">
                              <Truck className="size-3 text-primary shrink-0" />
                              {vendorDisplayName(selectedGroup.vendor)}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {canManageMaterial && (
                    <div className="flex items-center gap-2 shrink-0 self-start">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenEdit}
                        className="h-8 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenDelete}
                        className="h-8 text-xs font-semibold flex items-center gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Project</TableHead>
                      <TableHead className="text-xs">Indent Ref</TableHead>
                      <TableHead className="text-xs">Due Date</TableHead>
                      <TableHead className="text-xs">Quantity</TableHead>
                      <TableHead className="text-xs">Approx. Rate</TableHead>
                      <TableHead className="text-xs">Final Rate</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedGroup.items.map((item) => {
                      const isEditing = editingItemId === item.id;
                      const indentStatus = item.indent.status;
                      const isDraft = indentStatus === "DRAFT";
                      const isSubmittedOrAssigned = indentStatus === "SUBMITTED" || indentStatus === "ASSIGNED";
                      const isRequester = item.indent.requestedBy?.id === workspaceMemberId;

                      const canUserEdit = !isAccounts && isRequester && isDraft;

                      return (
                        <TableRow key={item.id} className="hover:bg-muted/10">
                          <TableCell className="py-3 text-xs font-semibold text-foreground align-middle">
                            {item.indent.project?.name || "General"}
                          </TableCell>
                          <TableCell className="py-3 align-middle">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => {
                                  setSelectedGroupKey(null);
                                  router.push(`/w/${workspaceId}/procurement/indents/${item.indent.id}`);
                                }}
                                className="font-mono text-[11px] font-bold text-primary hover:underline text-left cursor-pointer"
                              >
                                {item.indent.indentId || "Draft"}
                              </button>
                              <div>
                                {getIndentStatusBadge(indentStatus)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 text-xs align-middle font-medium text-muted-foreground">
                            {item.indent.expectedDelivery ? (
                              new Date(item.indent.expectedDelivery).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-xs font-medium align-middle">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 w-[110px]">
                                <Input
                                  type="number"
                                  value={editQty}
                                  onChange={(e) => setEditQty(e.target.value)}
                                  className="h-8 text-xs font-mono w-full"
                                  min="1"
                                />
                                <span className="text-[11px] text-muted-foreground">{item.unit}</span>
                              </div>
                            ) : (
                              <span className="font-mono font-semibold">
                                {item.quantity} {item.unit}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-xs font-mono align-middle">
                            {item.estimatedUnitPrice
                              ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.estimatedUnitPrice / 100)
                              : "—"}
                          </TableCell>
                          <TableCell className="py-3 text-xs font-mono font-semibold align-middle">
                            {item.finalUnitPrice
                              ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.finalUnitPrice / 100)
                              : "—"}
                          </TableCell>
                          <TableCell className="py-3 text-right align-middle">
                            <div className="flex items-center justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveQuantity(item)}
                                    disabled={isSaving}
                                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1"
                                  >
                                    <Check className="size-3.5" /> Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingItemId(null)}
                                    disabled={isSaving}
                                    className="h-7 text-xs font-semibold flex items-center gap-1"
                                  >
                                    <X className="size-3.5" /> Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {canUserEdit && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingItemId(item.id);
                                        setEditQty(item.quantity.toString());
                                      }}
                                      className="h-7 text-xs font-semibold flex items-center gap-1"
                                    >
                                      <Pencil className="size-3.5" /> Edit
                                    </Button>
                                  )}
                                  {isDraft && isRequester && !isAccounts && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => handleSubmitIndent(item.indent.id)}
                                      className="h-7 text-xs font-semibold flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100/80"
                                    >
                                      <Send className="size-3.5" /> Submit
                                    </Button>
                                  )}
                                  {isSubmittedOrAssigned && isApprover && !isAccounts && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleApproveIndent(item.indent.id)}
                                      className="h-7 text-xs font-semibold flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <Check className="size-3.5" /> Approve
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Material Dialog - Step 1 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Pencil className="size-4 text-primary" /> Edit Material
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Modify the catalog material name or default unit of measure.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {selectedGroup?.materialId && (
              <div className="flex items-center justify-between text-xs bg-muted/50 p-2.5 rounded-md border border-border/60">
                <span className="text-muted-foreground font-medium">Material Code:</span>
                <span className="font-mono font-bold text-foreground">{selectedGroup.materialId}</span>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="edit-material-name" className="text-xs font-semibold">
                Material Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-material-name"
                value={editMaterialName}
                onChange={(e) => setEditMaterialName(e.target.value)}
                placeholder="e.g. River Sand, Samsung 86 Inch TV"
                className="text-xs h-9"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-material-unit" className="text-xs font-semibold">
                Default Unit of Measure (UoM)
              </Label>
              <Input
                id="edit-material-unit"
                value={editMaterialUnit}
                onChange={(e) => setEditMaterialUnit(e.target.value)}
                placeholder="e.g. Nos, CFT, Sq.m, Kg"
                className="text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleProceedToEditConfirm}
              className="bg-primary text-primary-foreground font-semibold"
            >
              Save Changes...
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Material Double Confirmation AlertDialog - Step 2 */}
      <AlertDialog open={isEditConfirmOpen} onOpenChange={setIsEditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" /> Confirm Material Changes
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs text-muted-foreground space-y-3 pt-1">
                <p>Are you sure you want to save these modifications to the material catalog?</p>
                <div className="bg-muted/50 p-3 rounded-md border border-border/60 text-xs space-y-1.5 font-sans">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Code:</span>
                    <span className="font-mono font-bold text-foreground">{selectedGroup?.materialId || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="text-foreground font-semibold text-right">
                      {selectedGroup?.materialName} <span className="text-muted-foreground">→</span> <span className="text-primary font-bold">{editMaterialName.trim()}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unit:</span>
                    <span className="text-foreground font-semibold text-right">
                      {selectedGroup?.unit || "None"} <span className="text-muted-foreground">→</span> <span className="text-primary font-bold">{editMaterialUnit.trim() || "None"}</span>
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Linked indent line items and capabilities will be updated with the new material details.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingMaterial}>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUpdateMaterial}
              disabled={isUpdatingMaterial}
              className="bg-primary text-primary-foreground font-semibold"
            >
              {isUpdatingMaterial ? "Updating..." : "Yes, Confirm & Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Material AlertDialog - Step 1 */}
      <AlertDialog open={isDeleteStep1Open} onOpenChange={setIsDeleteStep1Open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" /> Delete Material {selectedGroup?.materialName}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs text-muted-foreground space-y-2.5 pt-1">
                <p>
                  Are you sure you want to delete <strong className="text-foreground">{selectedGroup?.materialName}</strong> ({selectedGroup?.materialId}) from the workspace material catalog?
                </p>
                {selectedGroup && selectedGroup.items.length > 0 ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 p-2.5 rounded-md text-[11px]">
                    ⚠️ This material has <strong>{selectedGroup.items.length}</strong> associated line item(s). Deleting it will detach the catalog reference while preserving indent history.
                  </div>
                ) : (
                  <p className="text-[11px]">
                    Deleting this material will free code <strong className="font-mono text-foreground">{selectedGroup?.materialId}</strong> to be reused in ascending order for future materials.
                  </p>
                )}
                <p className="font-medium text-foreground text-xs">
                  A second confirmation will be required to execute this deletion.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleProceedToDeleteStep2}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Proceed to Delete...
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Material Final Double Confirmation AlertDialog - Step 2 */}
      <AlertDialog open={isDeleteStep2Open} onOpenChange={setIsDeleteStep2Open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4 text-destructive" /> Final Warning: Permanently Delete Material?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs text-muted-foreground space-y-2.5 pt-1">
                <p>
                  This is your <strong className="text-destructive">final confirmation</strong>. Are you absolutely certain you want to delete:
                </p>
                <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-md text-xs space-y-1">
                  <div className="font-mono font-bold text-foreground text-sm">
                    {selectedGroup?.materialId}
                  </div>
                  <div className="font-semibold text-foreground">
                    {selectedGroup?.materialName}
                  </div>
                </div>
                <p className="text-destructive font-medium text-xs">
                  This action cannot be undone. Once deleted, this material code will be recycled for future materials in ascending order.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMaterial}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMaterial}
              disabled={isDeletingMaterial}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              {isDeletingMaterial ? "Deleting..." : "Yes, Permanently Delete Material"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
