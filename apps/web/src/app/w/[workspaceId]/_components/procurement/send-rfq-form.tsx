"use client";

import { useState } from "react";
import { CalendarIcon, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SuggestedVendorCard } from "./suggested-vendor-card";
import { cn } from "@/lib/utils";

interface Suggestion {
  vendor: {
    id: string;
    name: string;
    companyName?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
  };
  similarityScore: number;
  hasSuppliedBefore: boolean;
  performanceScore: number | null;
  totalQuotes: number;
}

interface SendRfqFormProps {
  lineItemId: string;
  workspaceId: string;
  suggestions: Suggestion[];
  isSuggestionsLoading: boolean;
  onSuccess: (updatedItem: { id: string; status?: string; [key: string]: unknown }) => void;
}

export function SendRfqForm({
  lineItemId,
  workspaceId,
  suggestions,
  isSuggestionsLoading,
  onSuccess,
}: SendRfqFormProps) {
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Default deadline to 7 days from today
  const defaultDeadline = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  };

  const handleToggle = (vendorId: string) => {
    setSelectedVendorIds((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
  };

  const handleSend = async () => {
    if (selectedVendorIds.size === 0) {
      toast.error("Select at least one vendor");
      return;
    }
    if (!deadline) {
      toast.error("Set a quote deadline");
      return;
    }

    try {
      setIsSending(true);
      const res = await fetch(`/api/v1/procurement/rfq/send?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItemId,
          vendorIds: Array.from(selectedVendorIds),
          deadline: new Date(deadline).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send RFQ");
      toast.success(`RFQ sent to ${selectedVendorIds.size} vendor${selectedVendorIds.size > 1 ? "s" : ""}`);
      onSuccess(json.data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send RFQ");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Vendor list */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Users className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Select Vendors
          </span>
          {selectedVendorIds.size > 0 && (
            <span className="ml-auto text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              {selectedVendorIds.size} selected
            </span>
          )}
        </div>

        {isSuggestionsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : suggestions.length > 0 ? (
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {suggestions.map((s) => (
              <SuggestedVendorCard
                key={s.vendor.id}
                vendor={s.vendor}
                similarityScore={s.similarityScore}
                hasSuppliedBefore={s.hasSuppliedBefore}
                performanceScore={s.performanceScore}
                totalQuotes={s.totalQuotes}
                isSelected={selectedVendorIds.has(s.vendor.id)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              No vendors found matching this material.
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Add vendors manually via the Vendor directory and set their capabilities.
            </p>
          </div>
        )}
      </div>

      {/* Deadline */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <CalendarIcon className="size-3" /> Quote Deadline
        </Label>
        <Input
          type="date"
          value={deadline || defaultDeadline()}
          min={new Date().toISOString().split("T")[0]}
          onChange={(e) => setDeadline(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {/* Send button */}
      <Button
        onClick={handleSend}
        disabled={isSending || selectedVendorIds.size === 0}
        className={cn(
          "w-full h-10 font-semibold text-sm gap-2",
          selectedVendorIds.size > 0
            ? "bg-primary hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        )}
      >
        <Send className="size-4" />
        {isSending
          ? "Sending RFQ..."
          : selectedVendorIds.size > 0
          ? `Send RFQ to ${selectedVendorIds.size} Vendor${selectedVendorIds.size > 1 ? "s" : ""}`
          : "Select vendors to send RFQ"}
      </Button>
    </div>
  );
}
