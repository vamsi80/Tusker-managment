"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

interface IndentsClientProps {
  workspaceId: string;
}

export function IndentsClient({ workspaceId }: IndentsClientProps) {
  const router = useRouter();
  const { data: workspaceData } = useWorkspaceLayout();
  const workspaceRole = workspaceData?.permissions?.workspaceRole;
  const workspaceMemberId = workspaceData?.permissions?.workspaceMemberId;
  const [indents, setIndents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const fetchIndents = async () => {
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
  };

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

  useEffect(() => {
    fetchIndents();
  }, [workspaceId]);

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
      accessorKey: "project.name",
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
      header: "Vendor",
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.selectedVendor?.companyName || row.original.selectedVendor?.name || "—"}
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
        if (!canAct) return null;
        const approveLabel = ["PENDING_OWNER_APPROVAL", "PENDING_OWNER_COMPARATIVE_APPROVAL"].includes(ind.status)
          ? "Get Comparitives"
          : ind.status === "PENDING_OWNER_FINAL_APPROVAL"
            ? "Final Approve"
            : "Approve";
        return (
          <div className="flex justify-end gap-1.5">
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
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex-1 flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-bold text-foreground">Indents Register</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage and approve procurement indent requests</p>
        </div>
        {workspaceRole !== "ACCOUNTS" && (
          <Link href={`/w/${workspaceId}/procurement/indents/create`}>
            <Button size="sm" className="h-8 text-xs font-semibold flex items-center gap-1">
              <Plus className="size-3.5" /> Create Indent
            </Button>
          </Link>
        )}
      </div>
      <DataTable
        columns={indentColumns}
        data={indents}
        searchKey="name"
        searchPlaceholder="Search indents..."
        isLoading={isLoading}
        showPagination={true}
        showColumnToggle={true}
        onRowClick={(row) => router.push(`/w/${workspaceId}/procurement/indents/${row.id}`)}
      />
    </div>
  );
}

