"use client";

import { useState } from "react";
import { AlertCircle, BadgeCheck, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  type GstinLookupData,
  normalizeGstin,
  validateGstin,
} from "@/lib/procurement/gstin";

interface GstinLookupFieldProps {
  workspaceId: string;
  value: string;
  onChange: (value: string) => void;
  onVerified: (data: GstinLookupData) => void;
}

export function GstinLookupField({
  workspaceId,
  value,
  onChange,
  onVerified,
}: GstinLookupFieldProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<GstinLookupData | null>(null);

  const handleValueChange = (nextValue: string) => {
    onChange(normalizeGstin(nextValue).slice(0, 15));
    setError(null);
    setVerified(null);
  };

  const verify = async () => {
    const validation = validateGstin(value);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/procurement/vendors/gstin/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, gstin: validation.gstin }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "GSTIN verification failed.");
      }

      setVerified(payload.data);
      onVerified(payload.data);
      toast.success("GSTIN verified and registered details applied");
    } catch (lookupError) {
      const message = lookupError instanceof Error ? lookupError.message : "GSTIN verification failed.";
      setError(message);
      setVerified(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const isActive = verified?.status.toLowerCase() === "active";

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground/90">GSTIN / Tax ID</label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => handleValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void verify();
            }
          }}
          placeholder="e.g. 27AAPFU0939F1ZV"
          className="font-mono uppercase"
          maxLength={15}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error || verified ? "gstin-lookup-message" : undefined}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void verify()}
          disabled={isVerifying || value.length !== 15}
          className="shrink-0"
        >
          {isVerifying ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          <span className="hidden sm:inline">Verify</span>
        </Button>
      </div>

      {error && (
        <div id="gstin-lookup-message" className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {verified && (
        <div
          id="gstin-lookup-message"
          className="rounded-md border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/20"
        >
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-4 shrink-0 text-emerald-600" />
            <span className="truncate font-semibold text-foreground">
              {verified.trade_name || verified.legal_name}
            </span>
            <Badge
              variant="outline"
              className={isActive
                ? "ml-auto border-emerald-300 text-emerald-700"
                : "ml-auto border-amber-300 text-amber-700"}
            >
              {verified.status}
            </Badge>
          </div>
          {verified.trade_name && verified.trade_name !== verified.legal_name && (
            <p className="mt-1 truncate pl-6 text-muted-foreground">{verified.legal_name}</p>
          )}
        </div>
      )}
    </div>
  );
}
