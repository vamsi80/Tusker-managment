"use client";

import { Check, XCircle, Clock, IndianRupee, Package, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface QuoteCardProps {
  quote: {
    id: string;
    vendorId: string;
    unitPrice: number; // in paise
    quantity: number;
    totalPrice: number; // in paise
    leadTimeDays?: number | null;
    validUntil?: string | Date | null;
    notes?: string | null;
    status: string;
    rejectionReason?: string | null;
    vendor: {
      id: string;
      name: string;
      companyName?: string | null;
    };
  };
  lineItemMaterialName: string;
  workspaceId: string;
  canReview: boolean; // role-gated
  isWinner?: boolean; // approved quote
  onUpdate: () => void;
}

export function QuoteCard({
  quote,
  lineItemMaterialName,
  workspaceId,
  canReview,
  isWinner = false,
  onUpdate,
}: QuoteCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const unitPrice = quote.unitPrice / 100;
  const totalPrice = quote.totalPrice / 100;

  const formatINR = (val: number) =>
    `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleApprove = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/v1/procurement/rfq/quotes/${quote.id}/approve?w=${workspaceId}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to approve quote");
      toast.success("Quote approved — vendor capability updated automatically");
      onUpdate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to approve quote");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }
    try {
      setIsLoading(true);
      const res = await fetch(`/api/v1/procurement/rfq/quotes/${quote.id}/reject?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to reject quote");
      toast.success("Quote rejected");
      setShowRejectReason(false);
      setRejectReason("");
      onUpdate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject quote");
    } finally {
      setIsLoading(false);
    }
  };

  const statusConfig: Record<string, { label: string; className: string }> = {
    SUBMITTED: { label: "Submitted", className: "bg-blue-50/50 text-blue-600 border-blue-200/50" },
    APPROVED: { label: "Approved", className: "bg-emerald-50/50 text-emerald-600 border-emerald-200/50" },
    REJECTED: { label: "Rejected", className: "bg-red-50/50 text-red-600 border-red-200/50" },
  };

  const cfg = statusConfig[quote.status] ?? { label: quote.status, className: "" };

  return (
    <div className={cn(
      "rounded-lg border p-4 space-y-3 transition-all",
      isWinner ? "border-emerald-300 bg-emerald-50/30" : "border-border/70 bg-background",
      quote.status === "REJECTED" && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{quote.vendor.name}</span>
            {isWinner && (
              <Badge className="h-4 px-1.5 text-[9px] font-bold bg-emerald-600 text-white border-none">
                ✓ Winner
              </Badge>
            )}
          </div>
          {quote.vendor.companyName && (
            <p className="text-[10px] text-muted-foreground">{quote.vendor.companyName}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn("text-[9px] font-bold uppercase tracking-wide h-5 px-1.5", cfg.className)}
        >
          {cfg.label}
        </Badge>
      </div>

      {/* Pricing grid */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-md bg-muted/20 border border-border/40">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Unit Price</span>
          <span className="text-sm font-black text-foreground flex items-center gap-0.5">
            <IndianRupee className="size-3" />
            {unitPrice.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Quantity</span>
          <span className="text-sm font-black text-foreground flex items-center gap-0.5">
            <Package className="size-3" />
            {quote.quantity.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Total</span>
          <span className="text-sm font-black text-primary">{formatINR(totalPrice)}</span>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
        {quote.leadTimeDays != null && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {quote.leadTimeDays} day{quote.leadTimeDays !== 1 ? "s" : ""} lead time
          </span>
        )}
        {quote.validUntil && (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3" />
            Valid until {new Date(quote.validUntil).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        )}
      </div>

      {/* Notes */}
      {quote.notes && (
        <p className="text-[11px] text-muted-foreground italic border-l-2 border-muted pl-2">
          "{quote.notes}"
        </p>
      )}

      {/* Rejection reason */}
      {quote.status === "REJECTED" && quote.rejectionReason && (
        <p className="text-[10px] text-red-600 bg-red-50/50 border border-red-100 rounded px-2 py-1">
          Rejected: {quote.rejectionReason}
        </p>
      )}

      {/* Actions — only for SUBMITTED quotes when reviewer */}
      {canReview && quote.status === "SUBMITTED" && (
        <div className="pt-1 space-y-2">
          {!showRejectReason ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isLoading}
                className="h-8 text-xs font-semibold flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <Check className="size-3.5" /> Approve Quote
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRejectReason(true)}
                disabled={isLoading}
                className="h-8 text-xs font-semibold border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-1.5"
              >
                <XCircle className="size-3.5" /> Reject
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Rejection Reason
              </Label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Price too high / lead time too long"
                className="h-8 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowRejectReason(false); setRejectReason(""); }}
                  disabled={isLoading}
                  className="h-7 text-xs flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleReject}
                  disabled={isLoading || !rejectReason.trim()}
                  className="h-7 text-xs font-semibold flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  Confirm Reject
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
