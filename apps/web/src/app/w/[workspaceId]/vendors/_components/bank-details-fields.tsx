"use client";

import { Input } from "@/components/ui/input";
import { can } from "@tusker/core/lib/constants/capabilities";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

export type BankDetails = {
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  bankBranch: string;
};

export const EMPTY_BANK: BankDetails = {
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankName: "",
  bankBranch: "",
};

export const bankFromVendor = (v: Partial<Record<keyof BankDetails, string | null>>): BankDetails => ({
  bankAccountName: v.bankAccountName ?? "",
  bankAccountNumber: v.bankAccountNumber ?? "",
  bankIfsc: v.bankIfsc ?? "",
  bankName: v.bankName ?? "",
  bankBranch: v.bankBranch ?? "",
});

/** Settings -> Permissions "See vendor bank details". */
export function useCanSeeBank() {
  const { data } = useWorkspaceLayout();
  return can(data.permissions.capabilities, "vendors:bank");
}

/** Only sent when the member may see bank details; the API drops it otherwise anyway. */
export const bankPayload = (bank: BankDetails, allowed: boolean) =>
  allowed ? Object.fromEntries(Object.entries(bank).map(([k, v]) => [k, v.trim() || null])) : {};

const FIELDS: { key: keyof BankDetails; label: string; placeholder: string }[] = [
  { key: "bankAccountName", label: "Account holder name", placeholder: "As printed on the cheque" },
  { key: "bankAccountNumber", label: "Account number", placeholder: "e.g. 50100123456789" },
  { key: "bankIfsc", label: "IFSC", placeholder: "e.g. HDFC0001234" },
  { key: "bankName", label: "Bank name", placeholder: "e.g. HDFC Bank" },
  { key: "bankBranch", label: "Branch", placeholder: "e.g. Andheri East" },
];

export function BankDetailsFields({ value, onChange }: { value: BankDetails; onChange: (next: BankDetails) => void }) {
  const allowed = useCanSeeBank();
  if (!allowed) return null;

  return (
    <div className="space-y-4 border-t pt-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Bank details</h3>
        <p className="text-xs text-muted-foreground">Used for payments. Visible only to members allowed to see bank details.</p>
      </div>
      <div className="grid @3xl/main:grid-cols-2 gap-6">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <label className="text-sm font-semibold text-foreground/90">{f.label}</label>
            <Input
              value={value[f.key]}
              onChange={(e) =>
                onChange({ ...value, [f.key]: f.key === "bankIfsc" ? e.target.value.toUpperCase() : e.target.value })
              }
              placeholder={f.placeholder}
              autoComplete="off"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
