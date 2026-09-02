"use client";

import { useCallback, useState, useTransition, useEffect } from "react";
import { pubsub, EVENTS } from "@/lib/pubsub";
import { vendorDisplayName } from "@/lib/procurement/vendor-name";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QuotationImportDialog, type ImportedItem } from "@/app/w/[workspaceId]/_components/procurement/quotation-import-dialog";
import { matchByMaterialName } from "@/lib/procurement/quote-match";
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
  ReceiptText,
  FileUp,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { FALLBACK_UNITS } from "@/lib/procurement/units";
import { approveActionLabel } from "@/lib/procurement/status-filters";
import { getUserDisplayInitial, getUserDisplayName } from "@/lib/user-display-name";

/** An API error is a string or a shaped object; either way it reaches the user. */
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

interface IndentDetailClientProps {
  workspaceId: string;
  indent: any;
  /** The manager and the selected owners, so the approval table can name them. */
  approvers?: {
    id: string;
    workspaceRole: string;
    user: { name: string | null; surname: string | null; email: string | null };
  }[];
  /** Whose manager sign-off this indent needs; null when nobody is named. */
  managerMemberId?: string | null;
  /** True only for the accounts login that is allowed to raise purchase orders. */
  canCreatePo?: boolean;
}

export function IndentDetailClient({
  workspaceId,
  indent: initialIndent,
  approvers = [],
  managerMemberId = null,
  canCreatePo = false,
}: IndentDetailClientProps) {
  const router = useRouter();
  const { data: workspaceData } = useWorkspaceLayout();
  const workspaceRole = workspaceData?.permissions?.workspaceRole;
  const workspaceMemberId = workspaceData?.permissions?.workspaceMemberId;
  const isApprover = workspaceRole === "OWNER" || workspaceRole === "ADMIN" || workspaceRole === "MANAGER";
  const isAccounts = workspaceRole === "ACCOUNTS";

  const [indent, setIndent] = useState(initialIndent);
  const [isPending, startTransition] = useTransition();

  // Who each sign-off is waiting on, by name rather than by role. Ordered the
  // way the workflow runs, so the row in "Pending" is the person to chase.
  const approverName = (memberId: string | null) => {
    const member = approvers.find((candidate) => candidate.id === memberId);
    return member ? getUserDisplayName(member.user) : "Any manager";
  };
  const rejectedAtFinal = indent.rejectedStage === "FINAL";
  const approvalRows = (() => {
    const ownerIds: string[] = indent.approverIds || [];
    const state = (approved: boolean, isCurrentStage: boolean, isFinalStage: boolean) => {
      if (approved) return "APPROVED" as const;
      if (indent.status === "REJECTED" && rejectedAtFinal === isFinalStage) return "REJECTED" as const;
      return isCurrentStage ? ("PENDING" as const) : ("WAITING" as const);
    };

    return [
      {
        key: "manager-initial",
        stage: "Manager review",
        person: approverName(managerMemberId),
        state: state(
          Boolean(indent.managerApprovedAt),
          ["SUBMITTED", "ASSIGNED"].includes(indent.status),
          false
        ),
      },
      ...ownerIds.map((ownerId) => ({
        key: `owner-comparative-${ownerId}`,
        stage: "Owner authorization",
        person: approverName(ownerId),
        state: state(
          Boolean(indent.approvedByIds?.includes(ownerId)),
          ["PENDING_OWNER_APPROVAL", "PENDING_OWNER_COMPARATIVE_APPROVAL"].includes(indent.status),
          false
        ),
      })),
      {
        key: "manager-final",
        stage: "Manager final rates",
        person: approverName(managerMemberId),
        state: state(
          Boolean(indent.finalManagerApprovedAt),
          indent.status === "PENDING_MANAGER_FINAL_RATE_APPROVAL",
          true
        ),
      },
      ...ownerIds.map((ownerId) => ({
        key: `owner-final-${ownerId}`,
        stage: "Owner final approval",
        person: approverName(ownerId),
        state: state(
          Boolean(indent.finalOwnerApprovedByIds?.includes(ownerId)),
          indent.status === "PENDING_OWNER_FINAL_APPROVAL",
          true
        ),
      })),
    ];
  })();

  const approvalStateBadge = (state: "APPROVED" | "PENDING" | "WAITING" | "REJECTED") => {
    const styles = {
      APPROVED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      WAITING: "bg-muted text-muted-foreground border-border",
      REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
    } as const;
    const labels = {
      APPROVED: "Approved",
      PENDING: "Pending",
      WAITING: "Not yet due",
      REJECTED: "Rejected",
    } as const;
    return (
      <Badge variant="outline" className={`text-[10px] ${styles[state]}`}>
        {labels[state]}
      </Badge>
    );
  };

  // Several people act on the same indent at once. Whoever is looking at it
  // sees the stage change as it happens, so nobody approves against a status
  // that has already moved on.
  const refreshIndent = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/procurement/indents/${initialIndent.id}?w=${workspaceId}`);
      const body = await res.json();
      if (body.success) setIndent(body.data);
    } catch (error) {
      console.error("Failed to refresh indent", error);
    }
  }, [initialIndent.id, workspaceId]);

  useEffect(() => {
    return pubsub.subscribe(EVENTS.TEAM_UPDATE, (data: any) => {
      if (data?.action !== "PROJECT_INDENT_UPDATED") return;
      const changedId = data?.payload?.indentId;
      if (!changedId || changedId === initialIndent.id) refreshIndent();
    });
  }, [initialIndent.id, refreshIndent]);

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

  // The manager / selected owners can revise the numbers while the indent sits in
  // their review stage - approximate rates in the first round, final rates in the second.
  const managerApproverId = indent.raisedInProject
    ? indent.project?.projectManagerId ?? indent.requestedBy?.reportToId
    : indent.requestedBy?.reportToId ?? indent.project?.projectManagerId;
  const isManagerForIndent = Boolean(
    workspaceMemberId &&
    (managerApproverId
      ? workspaceMemberId === managerApproverId
      : ["MANAGER", "ADMIN", "OWNER"].includes(workspaceRole || ""))
  );
  const isSelectedOwner = Boolean(
    workspaceMemberId &&
    indent.approverIds?.includes(workspaceMemberId) &&
    ["OWNER", "ADMIN"].includes(workspaceRole || "")
  );
  const isReviewer =
    (["SUBMITTED", "ASSIGNED", "PENDING_MANAGER_FINAL_RATE_APPROVAL"].includes(indent.status) && isManagerForIndent) ||
    (["PENDING_OWNER_APPROVAL", "PENDING_OWNER_COMPARATIVE_APPROVAL", "PENDING_OWNER_FINAL_APPROVAL"].includes(indent.status) && isSelectedOwner);
  const revisionStage: "ESTIMATE" | "FINAL" | null =
    isAccounts || canEdit || !isReviewer
      ? null
      : ["PENDING_MANAGER_FINAL_RATE_APPROVAL", "PENDING_OWNER_FINAL_APPROVAL"].includes(indent.status)
        ? "FINAL"
        : "ESTIMATE";
  const canRevise = revisionStage !== null;
  const canEnterFinalRates =
    !isAccounts && isRequester && isFinalRateEntry && allSelectedOwnersAuthorized;

  // Owners / admins / managers run the indent itself; the requester keeps it while it is still theirs.
  const isIndentManager = !isAccounts && ["OWNER", "ADMIN", "MANAGER"].includes(workspaceRole || "");
  const canEditIndent =
    (isIndentManager || (isRequester && canEdit)) && indent.status !== "CANCELLED";
  const canDeleteIndent = isIndentManager && !(indent.purchaseOrders?.length > 0);

  // Edit row states
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editMaterialName, setEditMaterialName] = useState("");
  const [editQuantity, setEditQuantity] = useState(0);
  const [editUnit, setEditUnit] = useState("pcs");
  const [editSpecifications, setEditSpecifications] = useState("");
  const [editEstimatedRate, setEditEstimatedRate] = useState("");
  const [editFinalRate, setEditFinalRate] = useState("");

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
  const [units, setUnits] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editName, setEditName] = useState(initialIndent.name || "");
  const [editDescription, setEditDescription] = useState(initialIndent.description || "");
  const [editDelivery, setEditDelivery] = useState(
    initialIndent.expectedDelivery ? new Date(initialIndent.expectedDelivery).toISOString().slice(0, 10) : ""
  );
  const [editTaxPercent, setEditTaxPercent] = useState(String(initialIndent.taxPercent ?? ""));
  const [editExciseDutyPercent, setEditExciseDutyPercent] = useState(String(initialIndent.exciseDutyPercent ?? ""));
  const [editVatPercent, setEditVatPercent] = useState(String(initialIndent.vatPercent ?? ""));
  const [editTransportCharge, setEditTransportCharge] = useState(
    initialIndent.transportCharge == null ? "" : String(initialIndent.transportCharge / 100)
  );
  const [editLabourCharge, setEditLabourCharge] = useState(
    initialIndent.labourCharge == null ? "" : String(initialIndent.labourCharge / 100)
  );
  const [editApproverIds, setEditApproverIds] = useState<string[]>(initialIndent.approverIds || []);
  const [selectedVendorId, setSelectedVendorId] = useState<string>(initialIndent.selectedVendorId || "");

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/materials?w=${workspaceId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload.success) setMaterialCatalog(payload.data || []);
      })
      .catch(() => undefined);
    fetch(`/api/v1/procurement/indents/units?w=${workspaceId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload.success) setUnits(payload.data || []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!isEditOpen) return;
    let active = true;
    fetch(`/api/v1/workspaces/${workspaceId}/members/slim`)
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload.success) {
          setOwners((payload.data || []).filter((m: any) => ["OWNER", "ADMIN"].includes(m.workspaceRole)));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [workspaceId, isEditOpen]);

  useEffect(() => {
    if (!canEnterFinalRates) return;
    let active = true;
    fetch(`/api/v1/procurement/vendors?w=${workspaceId}&status=ACTIVE`)
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        // Swallowing this left an empty dropdown that looked like "no
        // suppliers exist" when it was really a refused request.
        if (!payload.success) {
          showErrorToast(payload.error, "Failed to load suppliers / contractors");
          return;
        }
        setVendors(payload.data || []);
      })
      .catch(() => {
        if (active) toast.error("Failed to load suppliers / contractors");
      });
    return () => {
      active = false;
    };
  }, [workspaceId, canEnterFinalRates]);

  const applyRememberedMaterial = (
    value: string,
    setName: (name: string) => void,
    setUnit: (unit: string) => void
  ) => {
    setName(value);
    const match = materialCatalog.find((material) => material.name.toLowerCase() === value.trim().toLowerCase());
    if (match?.defaultUnit?.abbreviation) setUnit(match.defaultUnit.abbreviation);
  };

  const displayedUnits = units.length > 0 ? units : FALLBACK_UNITS;

  const formatRate = (value?: number | null) =>
    value == null
      ? "—"
      : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);

  const estimatedSubtotal = (indent.lineItems || []).reduce(
    (total: number, item: any) => total + Number(item.estimatedUnitPrice || 0) * Number(item.quantity || 0),
    0
  );
  const optionalCharges = [
    { label: "Tax", percent: Number(indent.taxPercent || 0) },
    { label: "Excise duty", percent: Number(indent.exciseDutyPercent || 0) },
    { label: "VAT", percent: Number(indent.vatPercent || 0) },
  ].filter((charge) => charge.percent > 0);
  // Transport and labour are flat amounts in paise, not a share of the subtotal.
  const flatCharges = [
    { label: "Transportation", amount: Number(indent.transportCharge || 0) },
    { label: "Labour", amount: Number(indent.labourCharge || 0) },
  ].filter((charge) => charge.amount > 0);
  const optionalChargeTotal =
    optionalCharges.reduce((total, charge) => total + estimatedSubtotal * (charge.percent / 100), 0) +
    flatCharges.reduce((total, charge) => total + charge.amount, 0);


  const getIndentStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-neutral-300">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manager Request Review</Badge>;
      case "PENDING_OWNER_APPROVAL":
      case "PENDING_OWNER_COMPARATIVE_APPROVAL":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Owner Request Review</Badge>;
      case "COMPARATIVES_IN_PROGRESS":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Getting Comparatives</Badge>;
      case "PENDING_MANAGER_FINAL_RATE_APPROVAL":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Manager Price Review</Badge>;
      case "PENDING_OWNER_FINAL_APPROVAL":
        return <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">Awaiting Price Approval</Badge>;
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
          // Re-read rather than merging the response: one approval can open the
          // next stage, and every button on this page is drawn from the indent.
          await refreshIndent();
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to approve indent");
          // The refusal means this page was showing a stage that has moved on.
          await refreshIndent();
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
          await refreshIndent();
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to reject indent");
          await refreshIndent();
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

  const [scanMisses, setScanMisses] = useState<string[]>([]);
  const [isRateImportOpen, setIsRateImportOpen] = useState(false);

  /**
   * Fills the rate inputs from a scanned quotation. Rows that cannot be matched to
   * an existing line item are reported rather than guessed at, and nothing is sent
   * until the user reviews the values and submits.
   */
  const handleImportedRates = (items: ImportedItem[]) => {
    const lineItems = (indent.lineItems || []) as { id: string; materialName: string }[];
    const scanned = items.map((item) => ({ materialName: item.itemName, unitPrice: item.unitPrice }));
    const matched = matchByMaterialName(scanned, lineItems);

    setFinalRates((current) => {
      const next = { ...current };
      for (const [itemId, row] of matched) {
        if (row.unitPrice !== null && row.unitPrice > 0) next[itemId] = String(row.unitPrice);
      }
      return next;
    });

    const matchedRows = new Set(matched.values());
    setScanMisses(scanned.filter((row) => !matchedRows.has(row)).map((row) => row.materialName));
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
          body: JSON.stringify({ rates, vendorId: selectedVendorId || undefined }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Price submitted to the manager");
          setIndent({ ...indent, ...data.data });
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to submit price");
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
          toast.success("Request raised successfully");
          // Submission can legitimately skip stages depending on the requester
          // and selected approvers. Keep the existing relations while applying
          // the authoritative status and timestamps returned by the server.
          const updated = { ...indent, ...data.data };
          setIndent(updated);
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to raise request");
        }
      } catch (error) {
        toast.error("Request failed");
      }
    });
  };

  const handleSaveIndent = async () => {
    if (!editName.trim()) {
      toast.error("Indent name is required");
      return;
    }
    if (indent.status !== "APPROVED" && !editApproverIds.length) {
      toast.error("Select at least one owner for approval");
      return;
    }
    for (const [label, value] of [
      ["Tax", editTaxPercent],
      ["Excise duty", editExciseDutyPercent],
      ["VAT", editVatPercent],
    ] as const) {
      const parsed = Number(value);
      if (value !== "" && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)) {
        toast.error(`${label} must be between 0% and 100%`);
        return;
      }
    }
    for (const [label, value] of [
      ["Transportation charge", editTransportCharge],
      ["Labour charge", editLabourCharge],
    ] as const) {
      const parsed = Number(value);
      if (value !== "" && (!Number.isFinite(parsed) || parsed < 0)) {
        toast.error(`${label} must be a positive amount`);
        return;
      }
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}?w=${workspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName.trim(),
            description: editDescription.trim() || null,
            expectedDelivery: editDelivery ? new Date(editDelivery).toISOString() : null,
            ...(canEdit
              ? {
                  taxPercent: editTaxPercent === "" ? null : Number(editTaxPercent),
                  exciseDutyPercent: editExciseDutyPercent === "" ? null : Number(editExciseDutyPercent),
                  vatPercent: editVatPercent === "" ? null : Number(editVatPercent),
                  transportCharge:
                    editTransportCharge === "" ? null : Math.round(Number(editTransportCharge) * 100),
                  labourCharge: editLabourCharge === "" ? null : Math.round(Number(editLabourCharge) * 100),
                }
              : {}),
            ...(indent.status !== "APPROVED" ? { approverIds: editApproverIds } : {}),
          }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent updated");
          setIndent({ ...indent, ...data.data });
          setIsEditOpen(false);
          router.refresh();
        } else {
          showErrorToast(data.error, "Failed to update indent");
        }
      } catch {
        toast.error("Request failed");
      }
    });
  };

  const handleDeleteIndent = async () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}?w=${workspaceId}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Indent deleted");
          router.push(`/w/${workspaceId}/procurement/indents`);
        } else {
          setIsDeleteOpen(false);
          showErrorToast(data.error, "Failed to delete indent");
        }
      } catch {
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
    setEditFinalRate(item.finalUnitPrice ? String(item.finalUnitPrice / 100) : "");
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
    const toPaise = (value: string) => (value ? Math.round(Number(value) * 100) : undefined);
    const payload = canRevise
      ? {
          quantity: Number(editQuantity),
          ...(revisionStage === "FINAL"
            ? { finalUnitPrice: toPaise(editFinalRate) }
            : { estimatedUnitPrice: toPaise(editEstimatedRate) }),
        }
      : {
          materialName: editMaterialName.trim(),
          quantity: Number(editQuantity),
          unit: editUnit.trim(),
          specifications: editSpecifications.trim() || null,
          estimatedUnitPrice: toPaise(editEstimatedRate),
        };
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/procurement/indents/${indent.id}/items/${itemId}?w=${workspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Material updated");
          const updatedItems = indent.lineItems.map((li: any) =>
            li.id === itemId ? data.data : li
          );
          setIndent({ ...indent, lineItems: updatedItems });
          setEditingItemId(null);
          if (canRevise) router.refresh();
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
              {indent.selectedVendor && (
                <>
                  {" · "}Supplier / Contractor:{" "}
                  <strong className="text-foreground">
                    {vendorDisplayName(indent.selectedVendor)}
                  </strong>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Indent-level edit / delete */}
        {(canEditIndent || canDeleteIndent) && (
          <div className="flex items-center gap-2 ml-auto mr-2">
            {canEditIndent && (
              <Button
                variant="outline"
                onClick={() => setIsEditOpen(true)}
                disabled={isPending}
                className="h-8 text-xs font-semibold"
              >
                <Edit className="mr-1.5 size-3.5" /> Edit Indent
              </Button>
            )}
            {canDeleteIndent && (
              <Button
                variant="outline"
                onClick={() => setIsDeleteOpen(true)}
                disabled={isPending}
                className="h-8 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="mr-1.5 size-3.5" /> Delete
              </Button>
            )}
          </div>
        )}

        {/* Top Actions panel */}
        {!isAccounts && ["SUBMITTED", "ASSIGNED", "PENDING_MANAGER_FINAL_RATE_APPROVAL"].includes(indent.status) && isManagerForIndent && (
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
              {approveActionLabel(indent.status)}
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
              {approveActionLabel(indent.status)}
            </Button>
          </div>
        )}
        {indent.status === "APPROVED" && canCreatePo && (
          <Button
            onClick={() =>
              router.push(`/w/${workspaceId}/procurement/pos/new?indentId=${indent.id}`)
            }
            disabled={isPending}
            className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
          >
            <FileCheck className="mr-1.5 size-3.5" /> Download PO
          </Button>
        )}
        {indent.status === "DRAFT" && isRequester && !isAccounts && (
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSubmitForApproval}
              disabled={isPending}
              className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
            >
              <FileCheck className="size-3.5" /> Raise Request
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
                <span className="text-xs font-bold text-foreground mt-0.5">{indent.project?.name || "General indent"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Requested Delivery Date</span>
                <span className="text-xs font-semibold text-foreground mt-0.5">
                  {indent.expectedDelivery ? format(new Date(indent.expectedDelivery), "PPP") : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {(optionalCharges.length > 0 || flatCharges.length > 0) && (
            <Card>
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ReceiptText className="size-4" /> Additional Charges
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Material subtotal</span>
                  <span className="font-mono font-semibold">{formatRate(estimatedSubtotal)}</span>
                </div>
                {optionalCharges.map((charge) => (
                  <div key={charge.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{charge.label} ({charge.percent}%)</span>
                    <span className="font-mono font-semibold">
                      {formatRate(estimatedSubtotal * (charge.percent / 100))}
                    </span>
                  </div>
                ))}
                {flatCharges.map((charge) => (
                  <div key={charge.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{charge.label}</span>
                    <span className="font-mono font-semibold">{formatRate(charge.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-2.5 text-xs font-bold">
                  <span>Estimated total</span>
                  <span className="font-mono">{formatRate(estimatedSubtotal + optionalChargeTotal)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Requester Profile */}
          <Card>
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="size-4" /> Requested By
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3.5 flex items-center gap-3">
              <div className="size-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {getUserDisplayInitial(indent.requestedBy?.user)}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">
                  {getUserDisplayName(indent.requestedBy?.user)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {indent.requestedBy?.user?.email}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Who each sign-off waits on */}
          <Card>
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Check className="size-4" /> Approvals
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 text-[10px] uppercase">Stage</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase">Person</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase text-right pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvalRows.map((approval) => (
                    <TableRow key={approval.key} className="hover:bg-muted/10">
                      <TableCell className="py-2 text-[11px] text-muted-foreground">{approval.stage}</TableCell>
                      <TableCell className="py-2 text-xs font-semibold text-foreground">{approval.person}</TableCell>
                      <TableCell className="py-2 text-right pr-4">{approvalStateBadge(approval.state)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                  {getUserDisplayInitial(indent.finalApprovedBy.user)}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">
                    {getUserDisplayName(indent.finalApprovedBy.user)}
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
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    {(canEdit || canRevise) && <TableHead className="text-xs text-right w-[100px]">Actions</TableHead>}
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
                                disabled={isPending || canRevise}
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
                                  disabled={isPending || canRevise}
                                >
                                  {editUnit && !displayedUnits.some((u: any) => u.abbreviation === editUnit) && (
                                    <option value={editUnit}>{editUnit}</option>
                                  )}
                                  {displayedUnits.map((u: any) => (
                                    <option key={u.abbreviation} value={u.abbreviation}>
                                      {u.abbreviation} ({u.name})
                                    </option>
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
                                disabled={isPending || revisionStage === "FINAL"}
                              />
                            </TableCell>
                            <TableCell className="py-2">
                              {revisionStage === "FINAL" ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editFinalRate}
                                  onChange={(event) => setEditFinalRate(event.target.value)}
                                  placeholder="Final rate"
                                  className="h-8 text-xs font-mono"
                                  disabled={isPending}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">{formatRate(item.finalUnitPrice)}</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              <Input
                                value={editSpecifications}
                                onChange={(e) => setEditSpecifications(e.target.value)}
                                className="h-8 text-xs text-muted-foreground"
                                disabled={isPending || canRevise}
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
                            {(canEdit || canRevise) && (
                              <TableCell className="text-right py-2.5">
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={() => handleEditStart(item)}
                                    disabled={isPending}
                                    title={canRevise ? "Revise quantity / rate" : "Edit material"}
                                    className="size-7 text-blue-600 hover:bg-blue-50"
                                  >
                                    <Edit className="size-3.5" />
                                  </Button>
                                  {canEdit && (
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => handleDeleteItem(item.id)}
                                      disabled={isPending}
                                      className="size-7 text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  )}
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
                            {addUnit && !displayedUnits.some((u: any) => u.abbreviation === addUnit) && (
                              <option value={addUnit}>{addUnit}</option>
                            )}
                            {displayedUnits.map((u: any) => (
                              <option key={u.abbreviation} value={u.abbreviation}>
                                {u.abbreviation} ({u.name})
                              </option>
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
                          placeholder="Description (optional)..."
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
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-amber-800">
                      Enter the least manually negotiated rate for every material, then send the rates to your manager.
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-amber-900">Supplier / Contractor (optional)</span>
                      <select
                        value={selectedVendorId}
                        onChange={(event) => setSelectedVendorId(event.target.value)}
                        disabled={isPending}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="">No supplier / contractor selected</option>
                        {vendors.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendorDisplayName(vendor)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={isPending}
                      onClick={() => setIsRateImportOpen(true)}
                    >
                      <FileUp className="mr-1.5 size-3.5" /> Upload Quotation
                    </Button>
                    <Button onClick={handleSubmitFinalRates} disabled={isPending} className="shrink-0 h-8 text-xs">
                      <FileCheck className="mr-1.5 size-3.5" />
                      {indent.status === "REJECTED" ? "Resubmit Price" : "Submit Price"}
                    </Button>
                  </div>
                </div>
              )}
              {canEnterFinalRates && scanMisses.length > 0 && (
                <p className="bg-amber-50/50 px-4 pb-3 text-xs text-amber-800">
                  Not matched to any material on this indent, so no rate was filled in for{" "}
                  <span className="font-medium">{scanMisses.join(", ")}</span>. Enter those rates yourself.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <QuotationImportDialog
        open={isRateImportOpen}
        onOpenChange={setIsRateImportOpen}
        workspaceId={workspaceId}
        onImport={handleImportedRates}
      />

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Indent</DialogTitle>
            <DialogDescription className="text-xs">
              Materials and rates are edited in the table below.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Name</label>
              <Input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                disabled={isPending}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Description</label>
              <Textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                disabled={isPending}
                rows={3}
                className="text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">
                Requested Delivery Date
              </label>
              <Input
                type="date"
                value={editDelivery}
                onChange={(event) => setEditDelivery(event.target.value)}
                disabled={isPending}
                className="h-9 text-xs"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "edit-indent-tax", label: "Tax (%)", value: editTaxPercent, setValue: setEditTaxPercent },
                {
                  id: "edit-indent-excise",
                  label: "Excise Duty (%)",
                  value: editExciseDutyPercent,
                  setValue: setEditExciseDutyPercent,
                },
                { id: "edit-indent-vat", label: "VAT (%)", value: editVatPercent, setValue: setEditVatPercent },
              ].map((charge) => (
                <div key={charge.id} className="flex flex-col gap-1.5">
                  <label htmlFor={charge.id} className="text-[10px] uppercase font-bold text-muted-foreground">
                    {charge.label}
                  </label>
                  <Input
                    id={charge.id}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="Optional"
                    value={charge.value}
                    onChange={(event) => charge.setValue(event.target.value)}
                    disabled={isPending || !canEdit}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  id: "edit-indent-transport",
                  label: "Transportation (₹)",
                  value: editTransportCharge,
                  setValue: setEditTransportCharge,
                },
                {
                  id: "edit-indent-labour",
                  label: "Labour (₹)",
                  value: editLabourCharge,
                  setValue: setEditLabourCharge,
                },
              ].map((charge) => (
                <div key={charge.id} className="flex flex-col gap-1.5">
                  <label htmlFor={charge.id} className="text-[10px] uppercase font-bold text-muted-foreground">
                    {charge.label}
                  </label>
                  <Input
                    id={charge.id}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Optional"
                    value={charge.value}
                    onChange={(event) => charge.setValue(event.target.value)}
                    disabled={isPending || !canEdit}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
            {indent.status !== "APPROVED" && <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Owners for approval</label>
              <div className="max-h-[160px] overflow-y-auto rounded-md border">
                {owners.map((owner) => (
                  <label
                    key={owner.id}
                    className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={editApproverIds.includes(owner.id)}
                      onChange={() =>
                        setEditApproverIds((current) =>
                          current.includes(owner.id)
                            ? current.filter((id) => id !== owner.id)
                            : [...current, owner.id]
                        )
                      }
                      disabled={isPending}
                    />
                    <span className="truncate">{owner.surname || owner.name || "Owner"}</span>
                  </label>
                ))}
                {owners.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Loading owners...</p>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Dropping an owner also drops the approval they had already given.
              </p>
            </div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditOpen(false)} disabled={isPending} className="h-8 text-xs">
              Cancel
            </Button>
            <Button onClick={handleSaveIndent} disabled={isPending} className="h-8 text-xs">
              <Save className="mr-1.5 size-3.5" /> Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base">Delete this indent?</DialogTitle>
            <DialogDescription className="text-xs">
              {indent.indentId || "This indent"} and all of its materials will be permanently removed. To keep the
              record instead, cancel the indent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteOpen(false)} disabled={isPending} className="h-8 text-xs">
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteIndent}
              disabled={isPending}
              className="h-8 text-xs"
            >
              <Trash2 className="mr-1.5 size-3.5" /> Delete Indent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
