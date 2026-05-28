"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VendorMatchPillProps {
  lineItemId: string;
  indentId: string;
  workspaceId: string;
  materialName: string;
  onClick?: () => void;
}

export function VendorMatchPill({
  lineItemId,
  indentId,
  workspaceId,
  materialName,
  onClick,
}: VendorMatchPillProps) {
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(
          `/api/v1/procurement/rfq/items/${lineItemId}/suggested-vendors?w=${workspaceId}`
        );
        if (res.ok) {
          const json = await res.json();
          setCount((json.data || []).length);
        }
      } catch {
        setCount(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCount();
  }, [lineItemId, workspaceId]);

  if (isLoading) {
    return (
      <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
    );
  }

  const hasVendors = (count ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      title={
        hasVendors
          ? `${count} vendor${count === 1 ? "" : "s"} can supply "${materialName}"`
          : `No vendors found for "${materialName}"`
      }
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-all",
        hasVendors
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer"
          : "bg-muted text-muted-foreground border-transparent cursor-default"
      )}
    >
      <Building2 className="size-2.5 flex-shrink-0" />
      <span>{hasVendors ? count : "–"}</span>
    </button>
  );
}
