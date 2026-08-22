"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/lib/toast";
import Link from "next/link";
import { FilterX, Plus, Search, Trash2 } from "lucide-react";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  areStatusFiltersEqual,
  INDENT_STATUS_OPTIONS,
  parseProcurementStatusParam,
} from "@/lib/procurement/status-filters";

interface IndentsClientProps {
  workspaceId: string;
}

const INDENT_STATUSES = INDENT_STATUS_OPTIONS.map((option) => option.value);
const NO_VENDOR = "__NO_VENDOR__";
const NO_TASK = "__NO_TASK__";
const UNASSIGNED = "__UNASSIGNED__";

const DELIVERY_FILTER_OPTIONS = [
  { value: "OVERDUE", label: "Overdue" },
  { value: "THIS_WEEK", label: "Due This Week" },
  { value: "NEXT_WEEK", label: "Due Next Week" },
  { value: "NO_DATE", label: "No Delivery Date" },
];

const CREATED_FILTER_OPTIONS = [
  { value: "TODAY", label: "Created Today" },
  { value: "THIS_WEEK", label: "Created This Week" },
  { value: "THIS_MONTH", label: "Created This Month" },
  { value: "LAST_30_DAYS", label: "Last 30 Days" },
];

const VALUE_FILTER_OPTIONS = [
  { value: "UNDER_100K", label: "Below ₹1 lakh" },
  { value: "100K_500K", label: "₹1–5 lakhs" },
  { value: "500K_1M", label: "₹5–10 lakhs" },
  { value: "OVER_1M", label: "Above ₹10 lakhs" },
];

const MATERIAL_COUNT_FILTER_OPTIONS = [
  { value: "NONE", label: "No Materials" },
  { value: "ONE_TO_FIVE", label: "1–5 Materials" },
  { value: "SIX_TO_TEN", label: "6–10 Materials" },
  { value: "OVER_TEN", label: "More Than 10" },
];

const getPersonName = (member: any) => {
  const name = member?.user?.name || "";
  const surname = member?.user?.surname || "";
  return `${name} ${surname}`.trim() || "Unknown user";
};

const collectSearchValues = (value: unknown): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(collectSearchValues);
  if (typeof value === "object") return Object.values(value).flatMap(collectSearchValues);
  return [String(value)];
};

const getIndentSearchText = (indent: any) => {
  const searchableValues = collectSearchValues(indent);
  const statusLabel = INDENT_STATUS_OPTIONS.find((option) => option.value === indent.status)?.label;

  [indent.expectedDelivery, indent.createdAt, indent.updatedAt, indent.submittedAt].forEach((value) => {
    if (!value) return;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      searchableValues.push(format(date, "MMM d yyyy EEEE"), format(date, "dd/MM/yyyy"));
    }
  });

  if (statusLabel) searchableValues.push(statusLabel);
  searchableValues.push(
    String((Number(indent.estimatedTotal) || 0) / 100),
    String((Number(indent.finalTotal) || 0) / 100),
    `${indent._count?.lineItems || 0} materials`,
  );

  return searchableValues.join(" ").toLocaleLowerCase();
};

const matchesAnySelectedOption = (
  selected: string[],
  matcher: (option: string) => boolean,
) => selected.length === 0 || selected.some(matcher);

export function IndentsClient({ workspaceId }: IndentsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const { data: workspaceData } = useWorkspaceLayout();
  const workspaceRole = workspaceData?.permissions?.workspaceRole;
  const workspaceMemberId = workspaceData?.permissions?.workspaceMemberId;
  const [indents, setIndents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<string[]>(() =>
    parseProcurementStatusParam(statusParam, INDENT_STATUSES),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [requesterFilter, setRequesterFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [taskFilter, setTaskFilter] = useState<string[]>([]);
  const [deliveryFilter, setDeliveryFilter] = useState<string[]>([]);
  const [createdFilter, setCreatedFilter] = useState<string[]>([]);
  const [valueFilter, setValueFilter] = useState<string[]>([]);
  const [materialCountFilter, setMaterialCountFilter] = useState<string[]>([]);

  const handleStatusFilterChange = (values: string[]) => {
    setStatusFilter(values);
    const params = new URLSearchParams(searchParams.toString());
    if (values.length > 0) params.set("status", values.join(","));
    else params.delete("status");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const fetchIndents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/procurement/indents?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setIndents(data.data);
      }
    } catch (e) {
      toast.error("Failed to load indents register");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  const handleApproveIndent = async (indentId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indentId}/approve?w=${workspaceId}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent approved successfully");
          fetchIndents();
        } else {
          toast.error(data.error || "Failed to approve indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  const handleRejectIndent = async (indentId: string) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indentId}/reject?w=${workspaceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent returned to the requester for revision");
          fetchIndents();
        } else {
          toast.error(data.error || "Failed to reject indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  const handleDeleteIndent = async (indentId: string, label: string) => {
    if (!window.confirm(`Delete indent ${label}? This removes it and all of its materials permanently.`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indentId}?w=${workspaceId}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent deleted");
          fetchIndents();
        } else {
          toast.error(data.error?.message || data.error || "Failed to delete indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  useEffect(() => {
    fetchIndents();
  }, [fetchIndents]);

  useEffect(() => {
    const nextStatuses = parseProcurementStatusParam(statusParam, INDENT_STATUSES);
    setStatusFilter((currentStatuses) =>
      areStatusFiltersEqual(currentStatuses, nextStatuses) ? currentStatuses : nextStatuses,
    );
  }, [statusParam]);

  const projectOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    indents.forEach((indent) => {
      if (indent.project?.id) {
        options.set(indent.project.id, { value: indent.project.id, label: indent.project.name });
      }
    });
    return Array.from(options.values()).sort((first, second) => first.label.localeCompare(second.label));
  }, [indents]);

  const requesterOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    indents.forEach((indent) => {
      if (indent.requestedById) {
        options.set(indent.requestedById, {
          value: indent.requestedById,
          label: getPersonName(indent.requestedBy),
        });
      }
    });
    return Array.from(options.values()).sort((first, second) => first.label.localeCompare(second.label));
  }, [indents]);

  const assigneeOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    indents.forEach((indent) => {
      if (indent.assignedTo?.id) {
        options.set(indent.assignedTo.id, {
          value: indent.assignedTo.id,
          label: getPersonName(indent.assignedTo),
        });
      }
    });
    return [
      { value: UNASSIGNED, label: "Unassigned" },
      ...Array.from(options.values()).sort((first, second) => first.label.localeCompare(second.label)),
    ];
  }, [indents]);

  const vendorOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    indents.forEach((indent) => {
      if (indent.selectedVendor?.id) {
        options.set(indent.selectedVendor.id, {
          value: indent.selectedVendor.id,
          label: indent.selectedVendor.companyName || indent.selectedVendor.name,
        });
      }
    });
    return [
      { value: NO_VENDOR, label: "No Supplier / Contractor Selected" },
      ...Array.from(options.values()).sort((first, second) => first.label.localeCompare(second.label)),
    ];
  }, [indents]);

  const taskOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    indents.forEach((indent) => {
      if (indent.taskId && indent.task?.name) {
        options.set(indent.taskId, { value: indent.taskId, label: indent.task.name });
      }
    });
    return [
      { value: NO_TASK, label: "No Linked Task" },
      ...Array.from(options.values()).sort((first, second) => first.label.localeCompare(second.label)),
    ];
  }, [indents]);

  const getIndentStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-neutral-300">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manager Review</Badge>;
      case "PENDING_OWNER_APPROVAL":
      case "PENDING_OWNER_COMPARATIVE_APPROVAL":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Owner Review</Badge>;
      case "COMPARATIVES_IN_PROGRESS":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Getting Comparatives</Badge>;
      case "PENDING_MANAGER_FINAL_RATE_APPROVAL":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manager Rate Review</Badge>;
      case "PENDING_OWNER_FINAL_APPROVAL":
        return <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">Owner Final Review</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Approved</Badge>;
      case "CANCELLED":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
      case "REJECTED":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected — Revision Required</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const indentColumns: ColumnDef<any>[] = [
    {
      accessorKey: "indentId",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-[11px] font-bold">
          {row.original.indentId || "Draft"}
        </span>
      ),
    },
    {
      id: "project.name",
      accessorFn: (row: any) => row.project?.name || "General",
      header: "Project",
      cell: ({ row }) => (
        <span className="text-xs font-semibold text-foreground">
          {row.original.project?.name}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Request Name",
      cell: ({ row }) => <span className="text-xs text-foreground font-medium">{row.original.name}</span>,
    },
    {
      id: "itemsCount",
      header: "Materials Count",
      cell: ({ row }) => <span className="text-xs">{row.original._count?.lineItems || 0} Materials</span>,
    },
    {
      id: "estimatedTotal",
      header: "Approx. Value",
      cell: ({ row }) => (
        <span className="text-xs font-mono font-semibold">
          {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((row.original.estimatedTotal || 0) / 100)}
        </span>
      ),
    },
    {
      id: "finalTotal",
      header: "Final Value",
      cell: ({ row }) => (
        <span className="text-xs font-mono font-semibold">
          {row.original.finalTotal == null
            ? "—"
            : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(row.original.finalTotal / 100)}
        </span>
      ),
    },
    {
      id: "vendor",
      header: "Supplier / Contractor",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.selectedVendor?.companyName || row.original.selectedVendor?.name || "-"}
        </span>
      ),
    },
    {
      id: "requestedBy",
      header: "Requested By",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.requestedBy?.user?.name} {row.original.requestedBy?.user?.surname}
        </span>
      ),
    },
    {
      accessorKey: "expectedDelivery",
      header: "Expected Delivery",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.expectedDelivery
            ? format(new Date(row.original.expectedDelivery), "MMM d, yyyy")
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => getIndentStatusBadge(row.original.status),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const ind = row.original;
        if (workspaceRole === "ACCOUNTS") return null;
        const managerStage = ["SUBMITTED", "ASSIGNED", "PENDING_MANAGER_FINAL_RATE_APPROVAL"].includes(ind.status);
        const ownerStage = ["PENDING_OWNER_APPROVAL", "PENDING_OWNER_COMPARATIVE_APPROVAL", "PENDING_OWNER_FINAL_APPROVAL"].includes(ind.status);
        const canAct =
          (managerStage && ["MANAGER", "ADMIN", "OWNER"].includes(workspaceRole || "")) ||
          (ownerStage && Boolean(workspaceMemberId && ind.approverIds?.includes(workspaceMemberId)));
        const canDelete = ["MANAGER", "ADMIN", "OWNER"].includes(workspaceRole || "");
        if (!canAct && !canDelete) return null;
        const approveLabel = ["PENDING_OWNER_APPROVAL", "PENDING_OWNER_COMPARATIVE_APPROVAL"].includes(ind.status)
          ? "Get Comparitives"
          : ind.status === "PENDING_OWNER_FINAL_APPROVAL"
            ? "Final Approve"
            : "Approve";
        return (
          <div className="flex justify-end gap-1.5">
            {canAct && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRejectIndent(ind.id)}
                  disabled={isPending}
                  className="h-7 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleApproveIndent(ind.id)}
                  disabled={isPending}
                  className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {approveLabel}
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDeleteIndent(ind.id, ind.indentId || ind.name)}
                disabled={isPending}
                title="Delete indent"
                className="h-7 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const filteredIndents = useMemo(() => {
    const today = startOfDay(new Date());
    const currentWeek = {
      start: startOfWeek(today, { weekStartsOn: 1 }),
      end: endOfWeek(today, { weekStartsOn: 1 }),
    };
    const nextWeekStart = startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
    const nextWeek = {
      start: nextWeekStart,
      end: endOfWeek(nextWeekStart, { weekStartsOn: 1 }),
    };
    const currentMonth = { start: startOfMonth(today), end: endOfMonth(today) };
    const searchTerms = searchQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

    return indents.filter((indent) => {
      if (statusFilter.length > 0 && !statusFilter.includes(indent.status)) return false;
      if (projectFilter.length > 0 && !projectFilter.includes(indent.projectId)) return false;
      if (requesterFilter.length > 0 && !requesterFilter.includes(indent.requestedById)) return false;

      const matchesAssignee = matchesAnySelectedOption(assigneeFilter, (option) =>
        option === UNASSIGNED ? !indent.assignedToId : indent.assignedToId === option,
      );
      if (!matchesAssignee) return false;

      const matchesVendor = matchesAnySelectedOption(vendorFilter, (option) =>
        option === NO_VENDOR ? !indent.selectedVendorId : indent.selectedVendorId === option,
      );
      if (!matchesVendor) return false;

      const matchesTask = matchesAnySelectedOption(taskFilter, (option) =>
        option === NO_TASK ? !indent.taskId : indent.taskId === option,
      );
      if (!matchesTask) return false;

      const deliveryDate = indent.expectedDelivery ? new Date(indent.expectedDelivery) : null;
      const hasValidDeliveryDate = Boolean(deliveryDate && !Number.isNaN(deliveryDate.getTime()));
      const matchesDelivery = matchesAnySelectedOption(deliveryFilter, (option) => {
        if (option === "NO_DATE") return !hasValidDeliveryDate;
        if (!deliveryDate || !hasValidDeliveryDate) return false;
        if (option === "OVERDUE") return isBefore(deliveryDate, today);
        if (option === "THIS_WEEK") return isWithinInterval(deliveryDate, currentWeek);
        if (option === "NEXT_WEEK") return isWithinInterval(deliveryDate, nextWeek);
        return false;
      });
      if (!matchesDelivery) return false;

      const createdDate = new Date(indent.createdAt);
      const matchesCreated = matchesAnySelectedOption(createdFilter, (option) => {
        if (Number.isNaN(createdDate.getTime())) return false;
        if (option === "TODAY") return isSameDay(createdDate, today);
        if (option === "THIS_WEEK") return isWithinInterval(createdDate, currentWeek);
        if (option === "THIS_MONTH") return isWithinInterval(createdDate, currentMonth);
        if (option === "LAST_30_DAYS") {
          return !isBefore(createdDate, subDays(today, 30)) && !isAfter(createdDate, new Date());
        }
        return false;
      });
      if (!matchesCreated) return false;

      const estimatedValue = (Number(indent.estimatedTotal) || 0) / 100;
      const matchesValue = matchesAnySelectedOption(valueFilter, (option) => {
        if (option === "UNDER_100K") return estimatedValue < 100_000;
        if (option === "100K_500K") return estimatedValue >= 100_000 && estimatedValue < 500_000;
        if (option === "500K_1M") return estimatedValue >= 500_000 && estimatedValue < 1_000_000;
        if (option === "OVER_1M") return estimatedValue >= 1_000_000;
        return false;
      });
      if (!matchesValue) return false;

      const materialCount = Number(indent._count?.lineItems) || 0;
      const matchesMaterialCount = matchesAnySelectedOption(materialCountFilter, (option) => {
        if (option === "NONE") return materialCount === 0;
        if (option === "ONE_TO_FIVE") return materialCount >= 1 && materialCount <= 5;
        if (option === "SIX_TO_TEN") return materialCount >= 6 && materialCount <= 10;
        if (option === "OVER_TEN") return materialCount > 10;
        return false;
      });
      if (!matchesMaterialCount) return false;

      if (searchTerms.length > 0) {
        const searchText = getIndentSearchText(indent);
        if (!searchTerms.every((term) => searchText.includes(term))) return false;
      }

      return true;
    });
  }, [
    assigneeFilter,
    createdFilter,
    deliveryFilter,
    indents,
    materialCountFilter,
    projectFilter,
    requesterFilter,
    searchQuery,
    statusFilter,
    taskFilter,
    valueFilter,
    vendorFilter,
  ]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    statusFilter.length ||
    projectFilter.length ||
    requesterFilter.length ||
    assigneeFilter.length ||
    vendorFilter.length ||
    taskFilter.length ||
    deliveryFilter.length ||
    createdFilter.length ||
    valueFilter.length ||
    materialCountFilter.length,
  );

  const resetFilters = () => {
    setSearchQuery("");
    setProjectFilter([]);
    setRequesterFilter([]);
    setAssigneeFilter([]);
    setVendorFilter([]);
    setTaskFilter([]);
    setDeliveryFilter([]);
    setCreatedFilter([]);
    setValueFilter([]);
    setMaterialCountFilter([]);
    handleStatusFilterChange([]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-foreground">Indents Register</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Manage and approve procurement indent requests</p>
        </div>
        {workspaceRole !== "ACCOUNTS" && (
          <Link href={`/w/${workspaceId}/procurement/indents/create`}>
            <Button size="sm" className="h-8 text-xs font-semibold flex items-center gap-1">
              <Plus className="size-3.5" /> Create Indent
            </Button>
          </Link>
        )}
      </div>

      <section className="shrink-0 space-y-3 rounded-lg border border-border/70 bg-muted/15 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search any indent field: number, name, project, requester, supplier, contractor, status..."
              aria-label="Search all indent fields"
              className="h-9 bg-background pl-9 text-xs"
            />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
            <span className="text-[11px] text-muted-foreground">
              Showing <strong className="text-foreground">{filteredIndents.length}</strong> of {indents.length}
            </span>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 px-2 text-xs text-muted-foreground"
              >
                <FilterX className="mr-1.5 size-3.5" /> Reset filters
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Status</Label>
            <MultiSelectFilter
              selected={statusFilter}
              onChange={handleStatusFilterChange}
              options={INDENT_STATUS_OPTIONS}
              placeholder="All statuses"
              searchPlaceholder="Search statuses..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Project</Label>
            <MultiSelectFilter
              selected={projectFilter}
              onChange={setProjectFilter}
              options={projectOptions}
              placeholder="All projects"
              searchPlaceholder="Search projects..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Requested By</Label>
            <MultiSelectFilter
              selected={requesterFilter}
              onChange={setRequesterFilter}
              options={requesterOptions}
              placeholder="All requesters"
              searchPlaceholder="Search requesters..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Assigned To</Label>
            <MultiSelectFilter
              selected={assigneeFilter}
              onChange={setAssigneeFilter}
              options={assigneeOptions}
              placeholder="All assignees"
              searchPlaceholder="Search assignees..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Supplier / Contractor</Label>
            <MultiSelectFilter
              selected={vendorFilter}
              onChange={setVendorFilter}
              options={vendorOptions}
              placeholder="All suppliers / contractors"
              searchPlaceholder="Search suppliers / contractors..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Linked Task</Label>
            <MultiSelectFilter
              selected={taskFilter}
              onChange={setTaskFilter}
              options={taskOptions}
              placeholder="All linked tasks"
              searchPlaceholder="Search tasks..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Delivery</Label>
            <MultiSelectFilter
              selected={deliveryFilter}
              onChange={setDeliveryFilter}
              options={DELIVERY_FILTER_OPTIONS}
              placeholder="Any delivery date"
              searchPlaceholder="Search delivery filters..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Created</Label>
            <MultiSelectFilter
              selected={createdFilter}
              onChange={setCreatedFilter}
              options={CREATED_FILTER_OPTIONS}
              placeholder="Any created date"
              searchPlaceholder="Search created filters..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Approx. Value</Label>
            <MultiSelectFilter
              selected={valueFilter}
              onChange={setValueFilter}
              options={VALUE_FILTER_OPTIONS}
              placeholder="Any value"
              searchPlaceholder="Search value ranges..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Materials</Label>
            <MultiSelectFilter
              selected={materialCountFilter}
              onChange={setMaterialCountFilter}
              options={MATERIAL_COUNT_FILTER_OPTIONS}
              placeholder="Any material count"
              searchPlaceholder="Search material counts..."
              triggerClassName="h-8 w-full text-xs"
            />
          </div>
        </div>
      </section>

      <DataTable
        columns={indentColumns}
        data={filteredIndents}
        isLoading={isLoading}
        showPagination={true}
        showColumnToggle={true}
        onRowClick={(row) => router.push(`/w/${workspaceId}/procurement/indents/${row.id}`)}
      />
    </div>
  );
}
