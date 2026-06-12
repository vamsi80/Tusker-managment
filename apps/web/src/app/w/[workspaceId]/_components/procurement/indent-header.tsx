"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Send, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndentData {
  id: string;
  indentId?: string | null;
  name: string;
  description?: string | null;
  status: string;
  cancelReason?: string | null;
  [key: string]: unknown;
}

interface IndentHeaderProps {
  indent: IndentData;
  workspaceId: string;
  workspaceRole?: string;
  isWorkspaceAdmin?: boolean;
  onUpdate: (updatedIndent: IndentData) => void;
}

export function IndentHeader({
  indent,
  workspaceId,
  workspaceRole,
  isWorkspaceAdmin = false,
  onUpdate,
}: IndentHeaderProps) {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const status = indent.status;

  // Status color mapper
  const getStatusBadge = (statusStr: string) => {
    switch (statusStr) {
      case "DRAFT":
        return <Badge variant="secondary" className="bg-muted text-muted-foreground border-none font-bold text-[10px] tracking-wide uppercase px-2 py-0.5">Draft</Badge>;
      case "SUBMITTED":
        return <Badge variant="outline" className="bg-blue-50/50 text-blue-600 border-blue-200/50 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5">Submitted</Badge>;
      case "ASSIGNED":
        return <Badge variant="outline" className="bg-purple-50/50 text-purple-600 border-purple-200/50 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5">Assigned</Badge>;
      case "APPROVED":
        return <Badge variant="outline" className="bg-green-50/50 text-green-600 border-green-200/50 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5">Approved</Badge>;
      case "CANCELLED":
        return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-none font-bold text-[10px] tracking-wide uppercase px-2 py-0.5">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{statusStr}</Badge>;
    }
  };

  const handleAction = async (endpoint: string, method = "POST", body?: Record<string, unknown>) => {
    try {
      setIsActionLoading(true);
      const res = await fetch(`/api/v1/procurement/indents/${indent.id}/${endpoint}?w=${workspaceId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Operation ${endpoint} failed`);
      }

      toast.success(json.message || `Indent updated successfully`);
      if (json.data) {
        onUpdate(json.data);
      } else {
        // For cancel or other endpoints that might not return updated model directly
        onUpdate({ ...indent, status: endpoint === "cancel" ? "CANCELLED" : indent.status });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update indent");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancelSubmit = () => {
    if (!cancelReason.trim()) {
      toast.error("Please enter a reason for cancellation");
      return;
    }
    setIsCancelDialogOpen(false);
    handleAction("cancel", "POST", { reason: cancelReason });
  };

  const isApprover = isWorkspaceAdmin || ["OWNER", "ADMIN", "MANAGER"].includes(workspaceRole || "");

  return (
    <div className="flex flex-col space-y-3 bg-muted/10 border border-border/80 rounded-lg p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-black tracking-widest text-muted-foreground uppercase">
            {indent.indentId || `IND-${indent.id.slice(0, 8)}`}
          </span>
          {getStatusBadge(status)}
        </div>

        <div className="flex items-center gap-2">
          {/* Submit Action (Draft only) */}
          {status === "DRAFT" && (
            <Button
              size="sm"
              variant="default"
              onClick={() => handleAction("submit")}
              disabled={isActionLoading}
              className="h-8 text-xs font-semibold gap-1.5"
            >
              <Send className="size-3" /> Submit
            </Button>
          )}

          {/* Approve Action (Submitted or Assigned for Admin/Owner/Manager) */}
          {["SUBMITTED", "ASSIGNED"].includes(status) && isApprover && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("approve")}
              disabled={isActionLoading}
              className="h-8 text-xs font-semibold border-green-600/30 text-green-700 bg-green-50/30 hover:bg-green-50 hover:text-green-800 hover:border-green-600/50 gap-1.5"
            >
              <Check className="size-3" /> Approve
            </Button>
          )}

          {/* Cancel Action (Draft, Submitted, or Assigned) */}
          {["DRAFT", "SUBMITTED", "ASSIGNED"].includes(status) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCancelReason("");
                setIsCancelDialogOpen(true);
              }}
              disabled={isActionLoading}
              className="h-8 text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/5 gap-1.5"
            >
              <XCircle className="size-3" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <h4 className="text-base font-bold text-foreground">{indent.name}</h4>
        {indent.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {indent.description}
          </p>
        )}
      </div>

      {indent.cancelReason && (
        <div className="border border-destructive/20 bg-destructive/5 rounded-md p-2.5 text-xs text-destructive">
          <span className="font-bold">Cancellation Reason:</span> {indent.cancelReason}
        </div>
      )}

      {/* Cancel Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cancel Indent</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this indent? This will reject all pending line items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="cancel-reason" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reason for Cancellation</Label>
            <Textarea
              id="cancel-reason"
              placeholder="e.g. Project plan changed / item no longer required..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCancelDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleCancelSubmit}>
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
