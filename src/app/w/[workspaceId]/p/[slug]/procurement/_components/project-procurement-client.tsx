"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, PackageSearch, Calendar, User, AlignLeft, Send } from "lucide-react";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";
import { useParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { toast } from "sonner";

interface LineItemData {
  id: string;
  materialName: string;
  unit: string;
  quantity: number;
  specifications?: string;
  status: string;
}

const lineItemColumns: ColumnDef<LineItemData>[] = [
  {
    accessorKey: "materialName",
    header: "Required Material",
    cell: ({ row }) => {
      const item = row.original;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-xs text-foreground">{item.materialName}</span>
          {item.specifications && (
            <span className="text-[10px] text-muted-foreground line-clamp-1">
              Spec: {item.specifications}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "unit",
    header: "Unit",
    cell: ({ getValue }) => {
      const val = getValue() as string;
      return <span className="text-xs font-medium uppercase">{val}</span>;
    },
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
    cell: ({ getValue }) => {
      const val = getValue() as number;
      return <span className="text-xs font-mono font-bold">{val}</span>;
    },
  },
  {
    accessorKey: "status",
    header: "Item Status",
    cell: ({ getValue }) => {
      const status = getValue() as string;
      return (
        <Badge
          variant="secondary"
          className="text-[9px] font-semibold tracking-wider uppercase bg-muted text-muted-foreground py-0"
        >
          {status}
        </Badge>
      );
    },
  },
];

interface ProjectProcurementClientProps {
  workspaceId: string;
  projectId: string;
  indents: any[];
  userRole: string;
}

export function ProjectProcurementClient({
  workspaceId,
  projectId,
  indents,
  userRole,
}: ProjectProcurementClientProps) {
  const router = useSafeNavigation();
  const { slug } = useParams();
  const [isSubmitting, startTransition] = useTransition();

  const [selectedIndentId, setSelectedIndentId] = useState<string | null>(
    indents.length > 0 ? indents[0].id : null
  );

  const selectedIndent = indents.find((i) => i.id === selectedIndentId);

  const handleSubmitForApproval = async () => {
    if (!selectedIndent) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${selectedIndent.id}/submit?w=${workspaceId}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent submitted for approval successfully");
          router.refresh();
        } else {
          toast.error(data.error || "Failed to submit indent");
        }
      } catch (error) {
        toast.error("Failed to submit indent");
      }
    });
  };

  const handleApproveIndent = async () => {
    if (!selectedIndent) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${selectedIndent.id}/approve?w=${workspaceId}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent approved successfully");
          router.refresh();
        } else {
          toast.error(data.error || "Failed to approve indent");
        }
      } catch (error) {
        toast.error("Failed to approve indent");
      }
    });
  };

  const handleRejectIndent = async () => {
    if (!selectedIndent) return;
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return; // Prompt cancelled
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${selectedIndent.id}/cancel?w=${workspaceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent rejected successfully");
          router.refresh();
        } else {
          toast.error(data.error || "Failed to reject indent");
        }
      } catch (error) {
        toast.error("Failed to reject indent");
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] py-0 px-2 font-medium">
            Draft
          </Badge>
        );
      case "SUBMITTED":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] py-0 px-2 font-medium">
            Submitted
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] py-0 px-2 font-medium">
            Approved
          </Badge>
        );
      case "CANCELLED":
      case "REJECTED":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[10px] py-0 px-2 font-medium">
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] py-0 px-2 font-medium">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4 shrink-0">
        <div>
          <h1 className="text-base font-bold text-foreground flex items-center gap-1.5">
            <AlignLeft className="h-4.5 w-4.5 text-primary" /> Procurement
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Manage material requests, track indents, and view required materials.
          </p>
        </div>
        <Button
          onClick={() => router.push(`/w/${workspaceId}/p/${slug}/procurement/create-indent`)}
          className="h-8 text-xs px-3"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Create New Indent
        </Button>
      </div>

      {indents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border/80 rounded-lg p-8 bg-muted/5">
          <PackageSearch className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-bold text-foreground">No Indents Created Yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-[280px] text-center">
            Create your first material request to track line items and vendor quotes.
          </p>
          <Button
            onClick={() => router.push(`/w/${workspaceId}/p/${slug}/procurement/create-indent`)}
            className="h-8 text-xs mt-4"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Create First Indent
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* ── LEFT: Indents List (35% width) ── */}
          <div className="w-[35%] flex flex-col gap-2 min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Requests ({indents.length})
              </Label>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
              {indents.map((indent) => {
                const isSelected = indent.id === selectedIndentId;
                return (
                  <div
                    key={indent.id}
                    onClick={() => setSelectedIndentId(indent.id)}
                    className={`flex flex-col gap-2 p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/30 select-none ${isSelected
                        ? "border-primary bg-primary/[0.03] shadow-sm ring-1 ring-primary/20"
                        : "border-border/80 bg-card hover:border-border"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-muted-foreground">
                        {indent.indentId || "DRAFT ID"}
                      </span>
                      {getStatusBadge(indent.status)}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground line-clamp-1">
                        {indent.name}
                      </h4>
                      {indent.task?.name && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                          Task: {indent.task.name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-1 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">
                          {indent.requestedBy?.user?.name || "Member"}
                        </span>
                      </div>
                      {indent.expectedDelivery && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {format(new Date(indent.expectedDelivery), "MMM d, yyyy")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: Materials / Line Items Details (65% width) ── */}
          <div className="flex-1 border border-border/80 bg-card rounded-lg flex flex-col min-h-0 overflow-hidden">
            {selectedIndent ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Selected Details Header */}
                <div className="p-4 border-b border-border/60 bg-muted/10 shrink-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-primary bg-primary/[0.08] px-2 py-0.5 rounded-full border border-primary/25">
                        {selectedIndent.indentId || "Draft Request"}
                      </span>
                      <h3 className="text-sm font-bold text-foreground mt-2">
                        {selectedIndent.name}
                      </h3>
                      {selectedIndent.description && (
                        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                          {selectedIndent.description}
                        </p>
                      )}
                      {selectedIndent.status === "CANCELLED" && selectedIndent.cancelReason && (
                        <p className="text-xs text-red-600 font-medium mt-1.5 bg-red-50 border border-red-200 rounded px-2.5 py-1 inline-block">
                          Rejection Reason: {selectedIndent.cancelReason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {getStatusBadge(selectedIndent.status)}
                      {selectedIndent.expectedDelivery && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/40">
                          <Calendar className="h-3 w-3 text-primary" />
                          <span>Delivery: {format(new Date(selectedIndent.expectedDelivery), "MMM d, yyyy")}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/30 pt-2 mt-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <div>
                        Requested By: <span className="font-semibold text-foreground">{selectedIndent.requestedBy?.user?.name} {selectedIndent.requestedBy?.user?.surname}</span>
                      </div>
                      {selectedIndent.task?.name && (
                        <div>
                          Linked Task: <span className="font-semibold text-foreground">{selectedIndent.task.name}</span>
                        </div>
                      )}
                    </div>
                    {selectedIndent.status === "DRAFT" && (
                      <Button
                        size="sm"
                        onClick={handleSubmitForApproval}
                        disabled={isSubmitting || selectedIndent.lineItems.length === 0}
                        className="h-7 text-xs px-2.5 bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 shrink-0"
                      >
                        <Send className="h-3 w-3" />
                        {isSubmitting ? "Submitting..." : "Submit for Approval"}
                      </Button>
                    )}
                    {selectedIndent.status === "SUBMITTED" && ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT"].includes(userRole) && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={handleRejectIndent}
                          disabled={isSubmitting}
                          variant="outline"
                          className="h-7 text-xs px-2.5 text-red-600 border-red-200 hover:bg-red-50"
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleApproveIndent}
                          disabled={isSubmitting}
                          className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="flex-1 overflow-y-auto">
                  <DataTable
                    columns={lineItemColumns}
                    data={selectedIndent.lineItems}
                    showPagination={false}
                    showColumnToggle={false}
                    containerClassName="border-0 shadow-none rounded-none"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                <PackageSearch className="h-10 w-10 opacity-20 mb-2" />
                <p className="text-xs">Select a request from the left panel to inspect required materials.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
