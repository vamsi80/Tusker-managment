"use client";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VendorGstDetails } from "@tusker/core/lib/procurement/gstin";

/**
 * Filled by the GSTIN lookup. Anything the registry answered is read-only — it
 * is the authority on these — and only the fields it left blank can be typed.
 */
const FIELDS: { key: keyof VendorGstDetails; label: string; type?: string; placeholder?: string }[] = [
  { key: "gstStatus", label: "GST Status", placeholder: "e.g. Active" },
  { key: "taxpayerType", label: "Taxpayer Type", placeholder: "e.g. Regular" },
  { key: "businessConstitution", label: "Business Constitution", placeholder: "e.g. Private Limited Company" },
  { key: "gstRegistrationDate", label: "Registration Date", type: "date" },
  { key: "gstCancellationDate", label: "Cancellation Date", type: "date" },
  { key: "stateJurisdiction", label: "State Jurisdiction", placeholder: "e.g. Ward 401" },
  { key: "natureOfBusiness", label: "Nature of Business", placeholder: "e.g. Wholesale Business, Retail Business" },
  { key: "blockStatus", label: "E-Way Bill Block Status", placeholder: "e.g. Unblocked" },
  { key: "einvoiceStatus", label: "E-Invoice Enabled", placeholder: "e.g. Yes" },
];

interface GstRegistrationFieldsProps {
  value: VendorGstDetails;
  onChange: (value: VendorGstDetails) => void;
  /** Fields the GST registry answered, which must not be edited by hand. */
  lockedKeys: (keyof VendorGstDetails)[];
}

export function GstRegistrationFields({ value, onChange, lockedKeys }: GstRegistrationFieldsProps) {
  const locked = new Set(lockedKeys);
  return (
    <Card className="shadow-sm border-border/50 !py-0 !gap-0">
      <CardHeader className="border-b bg-muted/30 py-2.5 !pb-2.5 px-6">
        <CardTitle className="text-lg font-semibold flex items-center gap-2 text-card-foreground">
          <ShieldCheck className="size-4 text-muted-foreground" /> GST Registration Details
        </CardTitle>
        <CardDescription>
          Filled from the GST registry when you verify a GSTIN. Verified values are locked; anything
          the registry left blank can be filled in by hand.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid md:grid-cols-3 gap-6">
          {FIELDS.map((field) => {
            const isLocked = locked.has(field.key);
            return (
              <div key={field.key} className="space-y-2">
                <label
                  className="text-sm font-semibold text-foreground/90 flex items-center gap-1.5"
                  htmlFor={field.key}
                >
                  {field.label}
                  {isLocked && (
                    <Lock className="size-3 text-muted-foreground" aria-label="From the GST registry" />
                  )}
                </label>
                <Input
                  id={field.key}
                  type={field.type}
                  value={value[field.key]}
                  onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                  placeholder={field.placeholder}
                  readOnly={isLocked}
                  aria-readonly={isLocked}
                  title={isLocked ? "Fetched from the GST registry and cannot be edited" : undefined}
                  className={cn(isLocked && "bg-muted/50 text-muted-foreground cursor-not-allowed")}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
