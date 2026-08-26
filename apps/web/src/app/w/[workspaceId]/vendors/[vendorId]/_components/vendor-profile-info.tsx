"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, FileSpreadsheet, Mail, MapPin, Phone, User } from "lucide-react";

interface VendorProfileInfoProps {
  vendor: {
    companyName?: string | null;
    contactPerson?: string | null;
    phoneNumber?: string | null;
    email?: string | null;
    hasGst?: boolean | null;
    gstNumber?: string | null;
    gstStatus?: string | null;
    taxpayerType?: string | null;
    businessConstitution?: string | null;
    gstRegistrationDate?: string | null;
    gstCancellationDate?: string | null;
    stateJurisdiction?: string | null;
    natureOfBusiness?: string | null;
    blockStatus?: string | null;
    einvoiceStatus?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    country?: string | null;
    address?: string | null;
  };
}

function ProfileRow({
  label,
  value,
  icon,
  mono = false,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`flex items-center gap-2 text-sm text-foreground ${mono ? "font-mono" : "font-medium"}`}>
        {icon}
        <span>{value?.trim() || "-"}</span>
      </div>
    </div>
  );
}

export function VendorProfileInfo({ vendor }: VendorProfileInfoProps) {
  const hasGst = vendor.hasGst ?? Boolean(vendor.gstNumber);

  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-border/50 !py-0 !gap-0">
        <CardHeader className="border-b bg-muted/30 py-2.5 !pb-2.5 px-6 items-center flex flex-row justify-between">
          <CardTitle className="text-md font-semibold flex items-center gap-2 text-card-foreground">
            <Building2 className="size-4 text-muted-foreground shrink-0" /> Supplier / Contractor Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <ProfileRow label="Company Legal Name" value={vendor.companyName} />
          <ProfileRow
            label="Contact Person"
            value={vendor.contactPerson}
            icon={<User className="size-4 shrink-0 text-muted-foreground" />}
          />
          <ProfileRow
            label="Phone Number"
            value={vendor.phoneNumber}
            icon={<Phone className="size-4 shrink-0 text-muted-foreground" />}
          />
          <ProfileRow
            label="Email Address"
            value={vendor.email}
            icon={<Mail className="size-4 shrink-0 text-muted-foreground" />}
          />
          <ProfileRow label="Has GST Registration" value={hasGst ? "Yes" : "No"} />
          <ProfileRow
            label="GSTIN / Tax ID"
            value={hasGst ? vendor.gstNumber : null}
            icon={<FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />}
            mono
          />
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/50 !py-0 !gap-0">
        <CardHeader className="border-b bg-muted/30 py-2.5 !pb-2.5 px-6">
          <CardTitle className="text-md font-semibold flex items-center gap-2 text-card-foreground">
            <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" /> GST Registration Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <ProfileRow label="GST Status" value={hasGst ? vendor.gstStatus : null} />
          <ProfileRow label="Taxpayer Type" value={hasGst ? vendor.taxpayerType : null} />
          <ProfileRow label="Business Constitution" value={hasGst ? vendor.businessConstitution : null} />
          <ProfileRow label="Registration Date" value={hasGst ? vendor.gstRegistrationDate : null} />
          <ProfileRow label="Cancellation Date" value={hasGst ? vendor.gstCancellationDate : null} />
          <ProfileRow label="State Jurisdiction" value={hasGst ? vendor.stateJurisdiction : null} />
          <ProfileRow label="Nature of Business" value={hasGst ? vendor.natureOfBusiness : null} />
          <ProfileRow label="E-Way Bill Block Status" value={hasGst ? vendor.blockStatus : null} />
          <ProfileRow label="E-Invoice Enabled" value={hasGst ? vendor.einvoiceStatus : null} />
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/50 !py-0 !gap-0">
        <CardHeader className="border-b bg-muted/30 py-2.5 !pb-2.5 px-6 items-center flex flex-row justify-between">
          <CardTitle className="text-md font-semibold flex items-center gap-2 text-card-foreground">
            <MapPin className="size-4 text-muted-foreground shrink-0" /> Registered Address
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <ProfileRow label="Address Line 1" value={vendor.addressLine1 || vendor.address} />
          <ProfileRow label="Address Line 2" value={vendor.addressLine2} />
          <ProfileRow label="City / Town" value={vendor.city} />
          <ProfileRow label="State / Province" value={vendor.state} />
          <ProfileRow label="PIN / ZIP Code" value={vendor.pincode} />
          <ProfileRow label="Country" value={vendor.country} />
        </CardContent>
      </Card>
    </div>
  );
}
