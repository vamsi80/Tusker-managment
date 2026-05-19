"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { VendorHeader } from "./_components/vendor-header";
import { VendorProfileInfo } from "./_components/vendor-profile-info";
import { VendorCapabilities } from "./_components/vendor-capabilities";

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const vendorId = params.vendorId as string;

  const [vendor, setVendor] = useState<any>(null);
  const [loadingVendor, setLoadingVendor] = useState(true);

  useEffect(() => {
    fetchVendorDetails();
  }, [vendorId, workspaceId]);

  const fetchVendorDetails = async () => {
    try {
      const res = await fetch(`/api/v1/procurement/vendors/${vendorId}?w=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setVendor(data.data);
      } else {
        toast.error("Failed to load vendor details");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error loading vendor details");
    } finally {
      setLoadingVendor(false);
    }
  };

  if (loadingVendor) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading vendor profile...</span>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-foreground">Vendor not found</h2>
        <Button onClick={() => router.push(`/w/${workspaceId}/vendors`)} className="mt-4">
          Back to Directory
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <VendorHeader name={vendor.name} status={vendor.status} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Vendor Profile Info (Structured Address, Contact) */}
        <div className="lg:col-span-1">
          <VendorProfileInfo vendor={vendor} />
        </div>

        {/* Right Column: Material Capabilities */}
        <div className="lg:col-span-2">
          <VendorCapabilities vendorId={vendorId} workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
