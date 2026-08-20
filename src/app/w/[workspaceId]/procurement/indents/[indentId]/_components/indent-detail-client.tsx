"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Calendar,
  Check,
  User,
  X,
  Package,
  FileText,
  FileCheck,
  Edit,
  Trash2,
  Save,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

const UNITS = ["pcs", "kg", "meter", "box", "bag", "ton", "liter", "sqft", "cum"];

interface IndentDetailClientProps {
  workspaceId: string;
  indent: any;
}

export function IndentDetailClient({ workspaceId, indent: initialIndent }: IndentDetailClientProps) {
  const router = useRouter();
  const { data: workspaceData } = useWorkspaceLayout();
  const workspaceRole = workspaceData?.permissions?.workspaceRole;
  const workspaceMemberId = workspaceData?.permissions?.workspaceMemberId;
  const isApprover = workspaceRole === "OWNER" || workspaceRole === "ADMIN" || workspaceRole === "MANAGER";
  const isAccounts = workspaceRole === "ACCOUNTS";

  const [indent, setIndent] = useState(initialIndent);
  const [isPending, startTransition] = useTransition();

  const isRequester = Boolean(workspaceMemberId && workspaceMemberId === indent.requestedById);
  const allSelectedOwnersAuthorized = Boolean(
    indent.approverIds?.length &&
    indent.approverIds.every((id: string) => indent.approvedByIds?.includes(id))
  );
  const isInitialRevision = indent.status === "REJECTED" && indent.rejectedStage !== "FINAL";
  const isFinalRateEntry =
    indent.status === "COMPARATIVES_IN_PROGRESS" ||
    (indent.status === "REJECTED" && indent.rejectedStage === "FINAL");
  const canEdit = !isAccounts && (indent.status === "DRAFT" || isInitialRevision) && (isRequester || isApprover);
  const canEnterFinalRates =
    !isAccounts && isRequester && isFinalRateEntry && allSelectedOwnersAuthorized;

  // Edit row states
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editMaterialName, setEditMaterialName] = useState("");
  const [editQuantity, setEditQuantity] = useState(0);
  const [editUnit, setEditUnit] = useState("pcs");
  const [editSpecifications, setEditSpecifications] = useState("");
  const [editEstimatedRate, setEditEstimatedRate] = useState("");

  // Add row states
  const [addMaterialName, setAddMaterialName] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [addUnit, setAddUnit] = useState("pcs");
  const [addSpecifications, setAddSpecifications] = useState("");
  const [addEstimatedRate, setAddEstimatedRate] = useState("");
  const [finalRates, setFinalRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initialIndent.lineItems || []).map((item: any) => [
        item.id,
        item.finalUnitPrice ? String(item.finalUnitPrice / 100) : "",
      ])
    )
  );
  const [materialCatalog, setMaterialCatalog] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/materials?w=${workspaceId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload.success) setMaterialCatalog(payload.data || []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const applyRememberedMaterial = (
    value: string,
    setName: (name: string) => void,
    setUnit: (unit: string) => void
  ) => {
    setName(value);
    const match = materialCatalog.find((material) => material.name.toLowerCase() === value.trim().toLowerCase());
    if (match?.defaultUnit?.abbreviation) setUnit(match.defaultUnit.abbreviation);
  };

  const formatRate = (value?: number | null) =>
    value == null
      ? "—"
      : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);

  const showErrorToast = (errPayload: any, fallback: string) => {
    if (!errPayload) {
      toast.error(fallback);
      return;
    }
    if (typeof errPayload === "string") {
      toast.error(errPayload);
    } else if (errPayload && typeof errPayload.message === "string") {
      toast.error(errPayload.message);
    } else {
      toast.error(fallback);
    }
  };

  const getIndentStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-neutral-300">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manager Estimate Review</Badge>;
      case "PENDING_OWNER_APPROVAL":
      case "PENDING_OWNER_COMPARATIVE_APPROVAL":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Owner Comparative Authorization</Badge>;
      case "COMPARATIVES_IN_PROGRESS":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Getting Comparatives</Badge>;
      case "PENDING_MANAGER_FINAL_RATE_APPROVAL":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manager Final-Rate Review</Badge>;
      case "PENDING_OWNER_FINAL_APPROVAL":
        return <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">Owner Final Approval</Badge>;
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

  const handleApprove = async () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/approve?w=${workspaceId}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent approved successfully");
          const updated = { ...indent, ...data.data };
          setIndent(updated);
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to approve indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  const handleReject = async () => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/reject?w=${workspaceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent returned to the requester for revision");
          const updated = { ...indent, ...data.data };
          setIndent(updated);
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to reject indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  const handleResubmit = async () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/resubmit?w=${workspaceId}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent resubmitted for approval");
          setIndent({ ...indent, ...data.data });
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to resubmit indent");
        }
      } catch {
        toast.error("Request failed");
      }
    });
  };

  const handleSubmitFinalRates = async () => {
    const rates = (indent.lineItems || []).map((item: any) => ({
      itemId: item.id,
      finalUnitPrice: Math.round(Number(finalRates[item.id] || 0) * 100),
    }));
    if (rates.some((rate: any) => rate.finalUnitPrice <= 0)) {
      toast.error("Enter a positive final rate for every material");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/final-rates?w=${workspaceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rates }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Final rates submitted to the manager");
          setIndent({ ...indent, ...data.data });
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to submit final rates");
        }
      } catch {
        toast.error("Request failed");
      }
    });
  };

  const handleSubmitForApproval = async () => {
    if (!indent.lineItems || indent.lineItems.length === 0) {
      toast.error("Cannot submit an empty indent. Please add at least one material.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/submit?w=${workspaceId}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent submitted for approval");
          const updated = { ...indent, status: "SUBMITTED" };
          setIndent(updated);
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to submit indent");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  const handleEditStart = (item: any) => {
    setEditingItemId(item.id);
    setEditMaterialName(item.materialName);
    setEditQuantity(item.quantity);
    setEditUnit(item.unit || "pcs");
    setEditSpecifications(item.specifications || "");
    setEditEstimatedRate(item.estimatedUnitPrice ? String(item.estimatedUnitPrice / 100) : "");
  };

  const handleEditCancel = () => {
    setEditingItemId(null);
  };

  const handleEditSave = async (itemId: string) => {
    if (!editMaterialName.trim()) {
      toast.error("Material name is required");
      return;
    }
    if (editQuantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/items/${itemId}?w=${workspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            materialName: editMaterialName.trim(),
            quantity: Number(editQuantity),
            unit: editUnit.trim(),
            specifications: editSpecifications.trim() || null,
            estimatedUnitPrice: editEstimatedRate ? Math.round(Number(editEstimatedRate) * 100) : undefined,
          }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Material updated");
          const updatedItems = indent.lineItems.map((li: any) =>
            li.id === itemId ? data.data : li
          );
          setIndent({ ...indent, lineItems: updatedItems });
          setEditingItemId(null);
        } else {
          showErrorToast(data.error, "Failed to update item");
        }
      } catch (err) {
        toast.error("Request failed");
      }
    });
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm("Are you sure you want to remove this material from the indent?")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/items/${itemId}?w=${workspaceId}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Material removed");
          const updatedItems = indent.lineItems.filter((li: any) => li.id !== itemId);
          setIndent({ ...indent, lineItems: updatedItems });
        } else {
          showErrorToast(data.error, "Failed to delete item");
        }
      } catch (err) {
        toast.error("Request failed");
      }
    });
  };

  const handleAddItem = async () => {
    if (!addMaterialName.trim()) {
      toast.error("Material name is required");
      return;
    }
    if (addQuantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/items?w=${workspaceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            materialName: addMaterialName.trim(),
            quantity: Number(addQuantity),
            unit: addUnit.trim(),
            specifications: addSpecifications.trim() || undefined,
            estimatedUnitPrice: addEstimatedRate ? Math.round(Number(addEstimatedRate) * 100) : undefined,
          }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Material added to indent");
          const updatedItems = [...(indent.lineItems || []), data.data];
          setIndent({ ...indent, lineItems: updatedItems });
          setAddMaterialName("");
          setAddQuantity(1);
          setAddUnit("pcs");
          setAddSpecifications("");
          setAddEstimatedRate("");
        } else {
          showErrorToast(data.error, "Failed to add item");
        }
      } catch (err) {
        toast.error("Request failed");
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
      {/* Back button and page header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/w/${workspaceId}/procurement/indents`)}
            className="size-8"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground">{indent.name}</h1>
              {getIndentStatusBadge(indent.status)}
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5">
              Indent ID: <strong className="font-mono text-foreground">{indent.indentId || "Draft"}</strong>
            </span>
          </div>
        </div>

        {/* Top Actions panel */}
        {!isAccounts && ["SUBMITTED", "ASSIGNED", "PENDING_MANAGER_FINAL_RATE_APPROVAL"].includes(indent.status) && ["MANAGER", "ADMIN", "OWNER"].includes(workspaceRole || "") && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={isPending}
              className="h-8 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50"
            >
              <X className="mr-1.5 size-3.5" /> Reject
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isPending}
              className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="mr-1.5 size-3.5" />
              {indent.status === "PENDING_MANAGER_FINAL_RATE_APPROVAL" ? "Approve Final Rates" : "Approve Estimates"}
            </Button>
          </div>
        )}
        {!isAccounts && ["PENDING_OWNER_APPROVAL", "PENDING_OWNER_COMPARATIVE_APPROVAL", "PENDING_OWNER_FINAL_APPROVAL"].includes(indent.status) && ["OWNER", "ADMIN"].includes(workspaceRole || "") && indent.approverIds?.includes(workspaceMemberId) && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleReject} disabled={isPending} className="h-8 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50">
              <X className="mr-1.5 size-3.5" /> Reject
            </Button>
            <Button onClick={handleApprove} disabled={isPending} className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white">
              <Check className="mr-1.5 size-3.5" />
              {indent.status === "PENDING_OWNER_FINAL_APPROVAL" ? "Final Approve" : "Get Comparitives"}
            </Button>
          </div>
        )}
        {indent.status === "DRAFT" && isRequester && !isAccounts && (
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSubmitForApproval}
              disabled={isPending}
              className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
            >
              <FileCheck className="size-3.5" /> Submit for Approval
            </Button>
          </div>
        )}
        {indent.status === "REJECTED" && isRequester && indent.rejectedStage !== "FINAL" && !isAccounts && (
          <Button onClick={handleResubmit} disabled={isPending} className="h-8 text-xs font-semibold">
            <FileCheck className="mr-1.5 size-3.5" /> Resubmit Revised Indent
          </Button>
        )}
      </div>

      {indent.status === "REJECTED" && indent.rejectionReason && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <strong>Rejected for revision:</strong> {indent.rejectionReason}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left column: Indent metadata info */}
        <div className="flex flex-col gap-4">
          {/* Project Details */}
          <Card>
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="size-4" /> Project Context
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3.5 flex flex-col gap-3.5">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Associated Project</span>
                <span className="text-xs font-bold text-foreground mt-0.5">{indent.project?.name}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Requested Delivery Date</span>
                <span className="text-xs font-semibold text-foreground mt-0.5">
                  {indent.expectedDelivery ? format(new Date(indent.expectedDelivery), "PPP") : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Requester Profile */}
          <Card>
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="size-4" /> Requested By
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3.5 flex items-center gap-3">
              <div className="size-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {indent.requestedBy?.user?.name?.[0]}
                {indent.requestedBy?.user?.surname?.[0]}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">
                  {indent.requestedBy?.user?.name} {indent.requestedBy?.user?.surname}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {indent.requestedBy?.user?.email}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Approver Profile */}
          {indent.finalApprovedBy && (
            <Card>
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Check className="size-4 text-emerald-600" /> Approved By
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3.5 flex items-center gap-3">
                <div className="size-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
                  {indent.finalApprovedBy.user?.name?.[0]}
                  {indent.finalApprovedBy.user?.surname?.[0]}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">
                    {indent.finalApprovedBy.user?.name} {indent.finalApprovedBy.user?.surname}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {indent.finalApprovedBy.user?.email}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right 2 columns: Items Details table */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package className="size-4 text-primary" /> Requested Materials & Quantities
              </CardTitle>
              <CardDescription className="text-[11px]">
                List of materials requested in this procurement indent.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 border-t">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-xs">Material Name</TableHead>
                    <TableHead className="text-xs w-[180px]">Quantity</TableHead>
                    <TableHead className="text-xs">Approx. Rate</TableHead>
                    <TableHead className="text-xs">Final Rate</TableHead>
                    <TableHead className="text-xs">Specifications</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    {canEdit && <TableHead className="text-xs text-right w-[100px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indent.lineItems?.map((item: any) => {
                    const isEditing = editingItemId === item.id;
                    return (
                      <TableRow key={item.id}>
                        {isEditing ? (
                          <>
                            <TableCell className="py-2">
                              <Input
                                list="indent-material-catalog"
                                value={editMaterialName}
                                onChange={(e) => applyRememberedMaterial(e.target.value, setEditMaterialName, setEditUnit)}
                                className="h-8 text-xs font-semibold"
                                disabled={isPending}
                              />
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  value={editQuantity}
                                  onChange={(e) => setEditQuantity(Number(e.target.value))}
                                  className="h-8 w-20 text-xs font-mono"
                                  disabled={isPending}
                                />
                                <select
                                  value={editUnit}
                                  onChange={(e) => setEditUnit(e.target.value)}
                                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                                  disabled={isPending}
                                >
                                  {UNITS.map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editEstimatedRate}
                                onChange={(event) => setEditEstimatedRate(event.target.value)}
                                placeholder="Approx. rate"
                                className="h-8 text-xs font-mono"
                                disabled={isPending}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-xs text-muted-foreground">{formatRate(item.finalUnitPrice)}</TableCell>
                            <TableCell className="py-2">
                              <Input
                                value={editSpecifications}
                                onChange={(e) => setEditSpecifications(e.target.value)}
                                className="h-8 text-xs text-muted-foreground"
                                disabled={isPending}
                              />
                            </TableCell>
                            <TableCell className="py-2 align-middle">
                              <Badge variant="secondary" className="text-[10px] font-semibold">
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right py-2">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={handleEditCancel}
                                  disabled={isPending}
                                  className="size-7 text-red-600 hover:bg-red-50"
                                >
                                  <X className="size-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  onClick={() => handleEditSave(item.id)}
                                  disabled={isPending}
                                  className="size-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  <Check className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-semibold text-xs text-foreground py-2.5">
                              {item.materialName}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-foreground py-2.5">
                              {item.quantity} {item.unit}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-foreground py-2.5">
                              {formatRate(item.estimatedUnitPrice)}
                            </TableCell>
                            <TableCell className="py-2.5">
                              {canEnterFinalRates ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={finalRates[item.id] || ""}
                                  onChange={(event) => setFinalRates((current) => ({ ...current, [item.id]: event.target.value }))}
                                  placeholder="Enter final rate"
                                  className="h-8 min-w-[120px] text-xs font-mono"
                                  disabled={isPending}
                                />
                              ) : (
                                <span className="font-mono text-xs font-semibold">{formatRate(item.finalUnitPrice)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground py-2.5 max-w-[200px] truncate">
                              {item.specifications || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 align-middle">
                              <Badge variant="secondary" className="text-[10px] font-semibold">
                                {item.status}
                              </Badge>
                            </TableCell>
                            {canEdit && (
                              <TableCell className="text-right py-2.5">
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={() => handleEditStart(item)}
                                    disabled={isPending}
                                    className="size-7 text-blue-600 hover:bg-blue-50"
                                  >
                                    <Edit className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={() => handleDeleteItem(item.id)}
                                    disabled={isPending}
                                    className="size-7 text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </>
                        )}
                      </TableRow>
                    );
                  })}

                  {/* Add row form at the bottom */}
                  {canEdit && (
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableCell className="py-2">
                        <Input
                          list="indent-material-catalog"
                          placeholder="Add new material name..."
                          value={addMaterialName}
                          onChange={(e) => applyRememberedMaterial(e.target.value, setAddMaterialName, setAddUnit)}
                          className="h-8 text-xs font-semibold"
                          disabled={isPending}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            value={addQuantity}
                            onChange={(e) => setAddQuantity(Number(e.target.value))}
                            className="h-8 w-20 text-xs font-mono"
                            disabled={isPending}
                          />
                          <select
                            value={addUnit}
                            onChange={(e) => setAddUnit(e.target.value)}
                            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                            disabled={isPending}
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Approx. rate"
                          value={addEstimatedRate}
                          onChange={(event) => setAddEstimatedRate(event.target.value)}
                          className="h-8 text-xs font-mono"
                          disabled={isPending}
                        />
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="py-2">
                        <Input
                          placeholder="Specifications (optional)..."
                          value={addSpecifications}
                          onChange={(e) => setAddSpecifications(e.target.value)}
                          className="h-8 text-xs text-muted-foreground"
                          disabled={isPending}
                        />
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground text-[10px] italic align-middle">
                        Pending
                      </TableCell>
                      <TableCell className="text-right py-2">
                        <Button
                          size="sm"
                          onClick={handleAddItem}
                          disabled={isPending}
                          className="h-8 text-xs px-3 bg-primary hover:bg-primary/90 flex items-center gap-1"
                        >
                          <Plus className="size-3.5" /> Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}

                  {(!indent.lineItems || indent.lineItems.length === 0) && !canEdit && (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 7 : 6} className="h-24 text-center text-xs text-muted-foreground">
                        No materials found in this indent.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <datalist id="indent-material-catalog">
                {materialCatalog.map((material) => (
                  <option key={material.id} value={material.name} />
                ))}
              </datalist>
              {canEnterFinalRates && (
                <div className="flex items-center justify-between gap-4 border-t bg-amber-50/50 px-4 py-3">
                  <p className="text-xs text-amber-800">
                    Enter the least manually negotiated rate for every material, then send the rates to your manager.
                  </p>
                  <Button onClick={handleSubmitFinalRates} disabled={isPending} className="shrink-0 h-8 text-xs">
                    <FileCheck className="mr-1.5 size-3.5" />
                    {indent.status === "REJECTED" ? "Resubmit Final Rates" : "Submit Final Rates"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
