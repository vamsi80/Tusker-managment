"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Package,
  Clock,
  Send,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SendRfqForm } from "./send-rfq-form";
import { QuoteCard } from "./quote-card";
import { toast } from "sonner";

interface RfqSheetProps {
  open: boolean;
  onClose: () => void;
  lineItem: {
    id: string;
    materialName: string;
    unit: string;
    quantity: number;
    estimatedUnitPrice?: number | null;
    status: string;
    rfqDeadline?: string | Date | null;
    rfqSentAt?: string | Date | null;
  } | null;
  indentId: string;
  workspaceId: string;
  canSendRfq: boolean;
  canReviewQuotes: boolean;
  onLineItemUpdated: (updatedItem: any) => void;
}

type RfqView = "rfq" | "quotes";

export function RfqSheet({
  open,
  onClose,
  lineItem,
  indentId,
  workspaceId,
  canSendRfq,
  canReviewQuotes,
  onLineItemUpdated,
}: RfqSheetProps) {
  const [view, setView] = useState<RfqView>("rfq");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [isQuotesLoading, setIsQuotesLoading] = useState(false);

  // Determine the initial view based on line item status
  useEffect(() => {
    if (!lineItem) return;
    if (lineItem.status === "PENDING") {
      setView("rfq");
    } else {
      setView("quotes");
    }
  }, [lineItem?.id, lineItem?.status]);

  // Fetch vendor suggestions when in rfq view
  const fetchSuggestions = useCallback(async () => {
    if (!lineItem) return;
    try {
      setIsSuggestionsLoading(true);
      const res = await fetch(
        `/api/v1/procurement/rfq/items/${lineItem.id}/suggested-vendors?w=${workspaceId}`
      );
      if (res.ok) {
        const json = await res.json();
        setSuggestions(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch suggestions:", err);
    } finally {
      setIsSuggestionsLoading(false);
    }
  }, [lineItem?.id, workspaceId]);

  // Fetch quotes when in quotes view
  const fetchQuotes = useCallback(async () => {
    if (!lineItem) return;
    try {
      setIsQuotesLoading(true);
      const res = await fetch(
        `/api/v1/procurement/rfq/items/${lineItem.id}/quotes?w=${workspaceId}`
      );
      if (res.ok) {
        const json = await res.json();
        setQuotes(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch quotes:", err);
    } finally {
      setIsQuotesLoading(false);
    }
  }, [lineItem?.id, workspaceId]);

  // Fetch data when sheet opens or view changes
  useEffect(() => {
    if (!open || !lineItem) return;
    if (view === "rfq") {
      fetchSuggestions();
    } else {
      fetchQuotes();
    }
  }, [open, view, lineItem?.id]);

  if (!lineItem) return null;

  const deadlineDate = lineItem.rfqDeadline ? new Date(lineItem.rfqDeadline) : null;
  const isDeadlinePast = deadlineDate ? deadlineDate < new Date() : false;
  const daysUntilDeadline = deadlineDate
    ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const lineItemStatusConfig: Record<string, { label: string; className: string }> = {
    PENDING: { label: "Pending", className: "bg-muted text-muted-foreground border-transparent" },
    RFQ_SENT: { label: "RFQ Sent", className: "bg-orange-50/50 text-orange-600 border-orange-200/50" },
    QUOTES_RECEIVED: { label: "Quotes Received", className: "bg-sky-50/50 text-sky-600 border-sky-200/50" },
    APPROVED: { label: "Quote Approved", className: "bg-emerald-50/50 text-emerald-600 border-emerald-200/50" },
    REJECTED: { label: "Rejected", className: "bg-red-50/50 text-red-600 border-red-200/50" },
  };

  const statusCfg = lineItemStatusConfig[lineItem.status] ?? {
    label: lineItem.status,
    className: "",
  };

  const approvedQuote = quotes.find((q) => q.status === "APPROVED");

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 flex flex-col gap-0"
      >
        {/* Sheet header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-bold leading-tight truncate">
                {lineItem.materialName}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Package className="h-3 w-3" />
                    {lineItem.quantity.toLocaleString("en-IN")} {lineItem.unit}
                  </span>
                  {lineItem.estimatedUnitPrice && (
                    <span className="text-xs text-muted-foreground">
                      Est. ₹{(lineItem.estimatedUnitPrice / 100).toLocaleString("en-IN")} / unit
                    </span>
                  )}
                </div>
              </SheetDescription>
            </div>
            <Badge
              variant="outline"
              className={cn("text-[9px] font-bold uppercase tracking-wide h-5 px-2 shrink-0", statusCfg.className)}
            >
              {statusCfg.label}
            </Badge>
          </div>

          {/* Deadline indicator */}
          {deadlineDate && (
            <div className={cn(
              "mt-2 flex items-center gap-1.5 text-[10px] rounded-md px-2 py-1.5 border",
              isDeadlinePast
                ? "bg-red-50/50 text-red-600 border-red-200/50"
                : daysUntilDeadline !== null && daysUntilDeadline <= 2
                ? "bg-amber-50/50 text-amber-600 border-amber-200/50"
                : "bg-muted/40 text-muted-foreground border-border/50"
            )}>
              <Clock className="h-3 w-3 flex-shrink-0" />
              {isDeadlinePast
                ? `Deadline passed (${deadlineDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })})`
                : daysUntilDeadline === 0
                ? "Deadline: today"
                : `Quote deadline: ${deadlineDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} (${daysUntilDeadline} days left)`}
            </div>
          )}

          {/* View tabs (shown when RFQ was sent) */}
          {lineItem.status !== "PENDING" && (
            <div className="flex items-center gap-1 mt-3 border-b -mx-6 px-6 pb-0">
              <button
                onClick={() => setView("rfq")}
                className={cn(
                  "flex items-center gap-1.5 px-2 h-8 text-xs font-medium border-b-2 transition-colors",
                  view === "rfq"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Send className="h-3 w-3" /> Re-send RFQ
              </button>
              <button
                onClick={() => setView("quotes")}
                className={cn(
                  "flex items-center gap-1.5 px-2 h-8 text-xs font-medium border-b-2 transition-colors",
                  view === "quotes"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageSquare className="h-3 w-3" /> Quotes
                {quotes.length > 0 && (
                  <span className="ml-0.5 text-[9px] bg-primary/10 text-primary rounded-full px-1.5 font-bold">
                    {quotes.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </SheetHeader>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5">
            {view === "rfq" ? (
              /* ---- SEND RFQ VIEW ---- */
              <SendRfqForm
                lineItemId={lineItem.id}
                workspaceId={workspaceId}
                suggestions={suggestions}
                isSuggestionsLoading={isSuggestionsLoading}
                onSuccess={(updatedItem) => {
                  onLineItemUpdated(updatedItem);
                  setView("quotes");
                  fetchQuotes();
                }}
              />
            ) : (
              /* ---- QUOTES VIEW ---- */
              <div className="space-y-4">
                {/* Refresh button */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Received Quotes
                  </span>
                  <button
                    onClick={fetchQuotes}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                </div>

                {isQuotesLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : quotes.length > 0 ? (
                  <div className="space-y-3">
                    {/* Approved quote first if exists */}
                    {approvedQuote && (
                      <>
                        <QuoteCard
                          quote={approvedQuote}
                          lineItemMaterialName={lineItem.materialName}
                          workspaceId={workspaceId}
                          canReview={canReviewQuotes}
                          isWinner={true}
                          onUpdate={fetchQuotes}
                        />
                        {quotes.filter((q) => q.status !== "APPROVED").length > 0 && (
                          <Separator className="my-1" />
                        )}
                      </>
                    )}
                    {/* Other quotes */}
                    {quotes
                      .filter((q) => q.status !== "APPROVED")
                      .map((quote) => (
                        <QuoteCard
                          key={quote.id}
                          quote={quote}
                          lineItemMaterialName={lineItem.materialName}
                          workspaceId={workspaceId}
                          canReview={canReviewQuotes}
                          isWinner={false}
                          onUpdate={fetchQuotes}
                        />
                      ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 py-10 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">No quotes received yet</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      Vendors will submit quotes before the deadline
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
