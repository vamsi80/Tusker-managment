"use client";

import { useState } from "react";
import { Check, Star, TrendingUp, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SuggestedVendorCardProps {
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
  isSelected: boolean;
  onToggle: (vendorId: string) => void;
}

export function SuggestedVendorCard({
  vendor,
  similarityScore,
  hasSuppliedBefore,
  performanceScore,
  totalQuotes,
  isSelected,
  onToggle,
}: SuggestedVendorCardProps) {
  const matchPercent = Math.round(similarityScore * 100);

  return (
    <button
      type="button"
      onClick={() => onToggle(vendor.id)}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all duration-150",
        "hover:shadow-sm active:scale-[0.99]",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border/70 bg-background hover:border-border hover:bg-muted/20"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox indicator */}
        <div
          className={cn(
            "mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
            isSelected
              ? "bg-primary border-primary"
              : "border-muted-foreground/40"
          )}
        >
          {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground stroke-[3]" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Vendor name row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground truncate">{vendor.name}</span>
            {hasSuppliedBefore ? (
              <Badge className="h-4 px-1.5 text-[9px] font-bold gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                <Check className="h-2.5 w-2.5" /> Supplied Before
              </Badge>
            ) : (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-bold gap-1 text-muted-foreground shrink-0">
                <AlertCircle className="h-2.5 w-2.5" /> New
              </Badge>
            )}
          </div>

          {/* Company */}
          {vendor.companyName && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{vendor.companyName}</p>
          )}

          {/* Metrics row */}
          <div className="flex items-center gap-3 mt-2">
            {/* Similarity bar */}
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">Match</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    matchPercent >= 80 ? "bg-emerald-500" :
                    matchPercent >= 60 ? "bg-amber-500" : "bg-muted-foreground/40"
                  )}
                  style={{ width: `${matchPercent}%` }}
                />
              </div>
              <span className={cn(
                "text-[10px] font-bold tabular-nums",
                matchPercent >= 80 ? "text-emerald-600" :
                matchPercent >= 60 ? "text-amber-600" : "text-muted-foreground"
              )}>
                {matchPercent}%
              </span>
            </div>

            {/* Performance */}
            {performanceScore !== null ? (
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-bold text-foreground">{performanceScore}%</span>
                <span className="text-[10px] text-muted-foreground">({totalQuotes} quotes)</span>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground italic">No history</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
