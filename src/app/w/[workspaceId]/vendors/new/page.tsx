"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Truck, FileText, User, Mail, Phone, MapPin, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardVendorPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  // Form states
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Structured Address Form States
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Vendor Name is required");
      return;
    }

    setSubmitting(true);
    try {
      // Keep legacy address field filled as fallback for compatibility (joining structured fields)
      const legacyAddress = [addressLine1, addressLine2, city, state, pincode, country]
        .filter(Boolean)
        .join(", ");

      const res = await fetch(`/api/v1/procurement/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          companyName: companyName || undefined,
          contactPerson: contactPerson || undefined,
          email: email || undefined,
          phoneNumber: phoneNumber || undefined,
          gstNumber: gstNumber || undefined,
          address: legacyAddress || undefined,
          addressLine1: addressLine1 || undefined,
          addressLine2: addressLine2 || undefined,
          city: city || undefined,
          state: state || undefined,
          pincode: pincode || undefined,
          country: country || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Vendor onboarded successfully");
        router.push(`/w/${workspaceId}/vendors`);
      } else {
        toast.error(data.error || "Failed to onboard vendor");
      }
    } catch (error) {
      toast.error("Failed to onboard vendor");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={() => router.push(`/w/${workspaceId}/vendors`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> Onboard New Vendor
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="border-b bg-gray-50/50 py-4 px-6">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-gray-800">
              <FileText className="h-4 w-4 text-muted-foreground" /> Company Details
            </CardTitle>
            <CardDescription>Enter primary registry and identification details.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  Vendor / Supplier Name <span className="text-destructive">*</span>
                </label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mahadev Steel Trading"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Company Legal Name</label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Mahadev Steel & Co Pvt Ltd"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 border-t pt-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <User className="h-4 w-4 text-muted-foreground" /> Contact Person Name
                </label>
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-muted-foreground" /> Phone Number
                </label>
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-muted-foreground" /> Email Address
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. ramesh@mahadevsteel.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">GSTIN / Tax ID</label>
                <Input
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  className="font-mono uppercase"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Registered Business Address */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="border-b bg-gray-50/50 py-4 px-6">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-gray-800">
              <Building className="h-4 w-4 text-muted-foreground" /> Registered Business Address
            </CardTitle>
            <CardDescription>Specify the legal and physical location of the supplier.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Address Line 1</label>
                <Input
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Plot / Door No / Building / Road"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Address Line 2</label>
                <Input
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Area / Locality / Landmark"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">City / Town</label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mumbai"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">State / Province</label>
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Maharashtra"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">PIN / ZIP Code</label>
                <Input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="e.g. 400001"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Country</label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. India"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/w/${workspaceId}/vendors`)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="px-6">
                {submitting ? "Onboarding..." : "Onboard Supplier"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
