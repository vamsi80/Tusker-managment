"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, User, Phone, Mail, FileSpreadsheet, MapPin } from "lucide-react";

interface VendorProfileInfoProps {
  vendor: {
    contactPerson?: string | null;
    phoneNumber?: string | null;
    email?: string | null;
    gstNumber?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    country?: string | null;
    address?: string | null;
  };
}

export function VendorProfileInfo({ vendor }: VendorProfileInfoProps) {
  return (
    <div className="space-y-6">
      {/* Contact & Registry */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="border-b bg-muted/30 py-2.5 px-6">
          <CardTitle className="text-md font-semibold flex items-center gap-2 text-card-foreground">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Contact & Registry
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Person</div>
            <div className="text-sm font-medium text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" /> {vendor.contactPerson || "Not Provided"}
            </div>
          </div>

          <div className="space-y-1 border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone Number</div>
            <div className="text-sm font-medium text-foreground flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" /> {vendor.phoneNumber || "Not Provided"}
            </div>
          </div>

          <div className="space-y-1 border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</div>
            <div className="text-sm font-medium text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" /> {vendor.email || "Not Provided"}
            </div>
          </div>

          <div className="space-y-1 border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">GSTIN / Tax ID</div>
            <div className="text-sm font-mono text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> {vendor.gstNumber || "Not Provided"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registered Address */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="border-b bg-muted/30 py-2.5 px-6">
          <CardTitle className="text-md font-semibold flex items-center gap-2 text-card-foreground">
            <MapPin className="h-4 w-4 text-muted-foreground" /> Registered Address
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-3">
          {vendor.addressLine1 || vendor.city || vendor.state ? (
            <div className="space-y-1.5 text-sm text-foreground">
              {vendor.addressLine1 && <div>{vendor.addressLine1}</div>}
              {vendor.addressLine2 && <div className="text-muted-foreground">{vendor.addressLine2}</div>}
              {(vendor.city || vendor.state || vendor.pincode) && (
                <div className="font-medium">
                  {[vendor.city, vendor.state].filter(Boolean).join(", ")}
                  {vendor.pincode ? ` - ${vendor.pincode}` : ""}
                </div>
              )}
              {vendor.country && <div className="text-xs text-muted-foreground font-semibold uppercase mt-1">{vendor.country}</div>}
            </div>
          ) : vendor.address ? (
            <div className="text-sm text-foreground italic">{vendor.address}</div>
          ) : (
            <div className="text-sm text-muted-foreground italic">No address registered for this vendor.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
