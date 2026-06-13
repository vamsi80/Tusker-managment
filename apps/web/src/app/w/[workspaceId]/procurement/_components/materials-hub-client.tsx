"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Eye, Pencil, Check, X, Send, FolderKanban, Truck } from "lucide-react";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface LineItemRow {
  id: string;
  materialName: string;
  unit: string;
  quantity: number;
  specifications?: string;
  status: string;
  rfqDeadline?: string | null;
  indent: {
    id: string;
    indentId: string | null;
    name: string;
    status: string;
    project: Project;
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
  materialName: string;
  unit: string;
  combinedQuantity: number;
  statuses: string[];
  items: LineItemRow[];
  projectsCount?: number;
  vendorCount?: number;
}

export function MaterialsHubClient({
  workspaceId,
  projects,
}: MaterialsHubClientProps) {
  const router = useRouter();
  const { data: workspaceData } = useWorkspaceLayout();
  const workspaceRole = workspaceData?.permissions?.workspaceRole;
  const isApprover = workspaceRole === "OWNER" || workspaceRole === "ADMIN" || workspaceRole === "MANAGER";

  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

  // Edit quantity states
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Filters
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Loading states
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [vendorCoverages, setVendorCoverages] = useState<Array<{ materialName?: string; vendorCount?: number; indent?: { status?: string }; [key: string]: unknown }>>([]);

  const fetchVendorCoverages = async () => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors/materials/coverage?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setVendorCoverages(data.data);
      }
    } catch (e) {
      console.error("Failed to load vendor coverages", e);
    }
  };

  const fetchLineItems = async () => {
    setIsLoadingItems(true);
    try {
      const url = `/api/v1/procurement/indents/line-items?w=${workspaceId}&projectId=${projectFilter}&status=${statusFilter}`;
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
  };

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

  useEffect(() => {
    fetchLineItems();
    fetchVendorCoverages();
  }, [workspaceId, projectFilter, statusFilter]);

  // Group line items client-side by materialName (case insensitive) and unit
  const groupedItemsMap: Record<string, GroupedMaterialRow> = {};
  lineItems.forEach((item) => {
    const key = `${item.materialName.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
    if (!groupedItemsMap[key]) {
      groupedItemsMap[key] = {
        groupKey: key,
        materialName: item.materialName,
        unit: item.unit,
        combinedQuantity: 0,
        statuses: [],
        items: [],
      };
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
      (c) => (c.materialName?.toLowerCase().trim() ?? "") === group.materialName.toLowerCase().trim()
    );
    const vendorCount = coverage ? coverage.vendorCount : 0;

    return {
      ...group,
      projectsCount,
      vendorCount,
    };
  });

  const selectedGroup = selectedGroupKey ? groupedItemsMap[selectedGroupKey] : null;

  // const getStatusBadge = (status: string) => {
  //   switch (status) {
  //     case "PENDING":
  //       return <Badge variant="outline" className="bg-neutral-100 text-neutral-800 border-neutral-300 font-medium">Pending RFQ</Badge>;
  //     case "RFQ_SENT":
  //       return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300 font-medium">RFQ Sent</Badge>;
  //     case "QUOTES_RECEIVED":
  //       return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 font-medium">Quotes Recv</Badge>;
  //     case "APPROVED":
  //       return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-medium">Approved</Badge>;
  //     case "PO_CREATED":
  //       return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300 font-medium">PO Created</Badge>;
  //     default:
  //       return <Badge variant="outline">{status}</Badge>;
  //   }
  // };

  const getIndentStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline" className="bg-neutral-100 text-neutral-800 border-neutral-300 font-medium">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">Submitted</Badge>;
      case "ASSIGNED":
        return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 font-medium">Assigned</Badge>;
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
      accessorKey: "materialName",
      header: "Material Name",
      cell: ({ row }) => (
        <span className="text-xs font-semibold text-foreground">
          {row.original.materialName}
        </span>
      ),
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
      header: "Vendors Providing",
      cell: ({ row }) => {
        const count = row.original.vendorCount || 0;
        return (
          <div className="flex items-center gap-1.5">
            <Truck className="size-3.5 text-muted-foreground" />
            {count > 0 ? (
              <Badge variant="outline" className="bg-emerald-50/55 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800 text-[11px] font-semibold px-2 py-0.5">
                {count} {count === 1 ? "vendor" : "vendors"}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-neutral-50 text-neutral-400 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-500 dark:border-neutral-800 text-[11px] font-medium px-2 py-0.5">
                0 vendors
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
      <div className="flex items-center gap-4 shrink-0 bg-muted/20 p-3 rounded-lg border border-border/50">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold text-muted-foreground uppercase shrink-0">Project:</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold text-muted-foreground uppercase shrink-0">Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending RFQ</SelectItem>
              <SelectItem value="RFQ_SENT">RFQ Sent</SelectItem>
              <SelectItem value="QUOTES_RECEIVED">Quotes Received</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PO_CREATED">PO Created</SelectItem>
            </SelectContent>
          </Select>
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
              (item) => item.indent?.status === "APPROVED"
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
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/[0.08] px-2 py-0.5 rounded border border-primary/20">
                      Consolidated Material Overview
                    </span>
                    <SheetTitle className="text-base font-bold text-foreground mt-2">
                      {selectedGroup.materialName}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground mt-1">
                      Required in <strong className="text-foreground">{selectedGroup.items.length} {selectedGroup.items.length === 1 ? 'project' : 'projects'}</strong> | Combined total: <strong className="text-foreground">{selectedGroup.combinedQuantity} {selectedGroup.unit}</strong>
                    </SheetDescription>
                  </div>
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
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedGroup.items.map((item) => {
                      const isEditing = editingItemId === item.id;
                      const indentStatus = item.indent.status;
                      const isDraft = indentStatus === "DRAFT";
                      const isSubmittedOrAssigned = indentStatus === "SUBMITTED" || indentStatus === "ASSIGNED";

                      // DRAFT can be edited by any workspace member; SUBMITTED/ASSIGNED can only be edited by OWNER/ADMIN/MANAGER (isApprover)
                      const canUserEdit = isDraft || (isApprover && isSubmittedOrAssigned);

                      return (
                        <TableRow key={item.id} className="hover:bg-muted/10">
                          <TableCell className="py-3 text-xs font-semibold text-foreground align-middle">
                            {item.indent.project.name}
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
                                  {isDraft && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => handleSubmitIndent(item.indent.id)}
                                      className="h-7 text-xs font-semibold flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100/80"
                                    >
                                      <Send className="size-3.5" /> Submit
                                    </Button>
                                  )}
                                  {isSubmittedOrAssigned && isApprover && (
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
    </div>
  );
}
