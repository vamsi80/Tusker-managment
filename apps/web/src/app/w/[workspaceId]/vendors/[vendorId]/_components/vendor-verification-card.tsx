"use client";

import { useState } from "react";
import { BadgeCheck, Clock, Eye, EyeOff, Landmark, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@tusker/core/lib/constants/capabilities";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

interface Props {
  workspaceId: string;
  vendor: any;
  onChange: (vendor: any) => void;
}

const mask = (account: string) => (account.length > 4 ? `•••• ${account.slice(-4)}` : account);

/** Verification status (everyone) and bank details (vendors:bank only — the API omits them otherwise). */
export function VendorVerificationCard({ workspaceId, vendor, onChange }: Props) {
  const { data } = useWorkspaceLayout();
  const canVerify = can(data.permissions.capabilities, "vendors:verify");
  const canSeeBank = can(data.permissions.capabilities, "vendors:bank");
  const [saving, setSaving] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const verified = vendor.verificationStatus === "VERIFIED";

  const toggle = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendor.id}/verification?w=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: verified ? "PENDING" : "VERIFIED" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not update verification");
      onChange({ ...vendor, ...json.data });
      toast.success(verified ? "Marked as pending" : "Marked as verified");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update verification");
    } finally {
      setSaving(false);
    }
  };

  const bankRows: [string, string | null][] = [
    ["Account holder", vendor.bankAccountName],
    ["Account number", vendor.bankAccountNumber ? (showAccount ? vendor.bankAccountNumber : mask(vendor.bankAccountNumber)) : null],
    ["IFSC", vendor.bankIfsc],
    ["Bank", vendor.bankName],
    ["Branch", vendor.bankBranch],
  ];
  const hasBank = bankRows.some(([, v]) => v);

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          Verification
          <Badge
            variant="outline"
            className={
              verified
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 border-amber-500/20"
            }
          >
            {verified ? <BadgeCheck className="mr-1 size-3.5" /> : <Clock className="mr-1 size-3.5" />}
            {verified ? "Verified" : "Pending"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {verified && vendor.verifiedAt && (
          <p className="text-muted-foreground">Verified on {new Date(vendor.verifiedAt).toLocaleDateString("en-IN")}</p>
        )}
        {canVerify && (
          <Button size="sm" variant={verified ? "outline" : "default"} onClick={toggle} disabled={saving} className="w-full">
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {verified ? "Mark as pending" : "Mark as verified"}
          </Button>
        )}

        {canSeeBank && (
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold flex items-center gap-2">
                <Landmark className="size-4" /> Bank details
              </span>
              {vendor.bankAccountNumber && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setShowAccount((s) => !s)}
                  aria-label={showAccount ? "Hide account number" : "Show account number"}
                >
                  {showAccount ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              )}
            </div>
            {hasBank ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {bankRows.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium break-all">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground">No bank details yet. Add them from Edit.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
