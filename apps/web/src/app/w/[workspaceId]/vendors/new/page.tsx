"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Truck, FileText, User, Mail, Phone, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { countryDialCodes } from "@tusker/shared/country-codes";

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
  const [dialCode, setDialCode] = useState("+91");
  
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
      const fullPhone = phoneNumber.trim() ? `${dialCode} ${phoneNumber.trim()}` : "";
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
          phoneNumber: fullPhone || undefined,
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

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    const matchedDial = countryDialCodes[newCountry];
    if (matchedDial) {
      setDialCode(matchedDial);
    }
  };

  const handleDialCodeChange = (newDial: string) => {
    setDialCode(newDial);
    const matchedCountry = Object.keys(countryDialCodes).find(
      (key) => countryDialCodes[key] === newDial
    );
    if (matchedCountry) {
      setCountry(matchedCountry);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full"
          onClick={() => router.push(`/w/${workspaceId}/vendors`)}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-2xl font-normal leading-tight tracking-tighter md:text-2xl text-foreground">
          Onboard New Vendor
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="shadow-sm border-border/50 !py-0 !gap-0">
          <CardHeader className="border-b bg-muted/30 py-2.5 !pb-2.5 px-6">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-card-foreground">
              <FileText className="size-4 text-muted-foreground" /> Company Details
            </CardTitle>
            <CardDescription>Enter primary registry and identification details.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90 flex items-center gap-1.5">
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
                <label className="text-sm font-semibold text-foreground/90">Company Legal Name</label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Mahadev Steel & Co Pvt Ltd"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 border-t pt-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90 flex items-center gap-1.5">
                  <User className="size-4 text-muted-foreground" /> Contact Person Name
                </label>
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90 flex items-center gap-1.5">
                  <Phone className="size-4 text-muted-foreground" /> Phone Number
                </label>
                <div className="flex gap-2">
                  <select
                    value={dialCode}
                    onChange={(e) => handleDialCodeChange(e.target.value)}
                    className="flex h-9 w-[110px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                  >
                    {Object.entries(countryDialCodes).map(([cName, code]) => (
                      <option key={cName} value={code} className="bg-background text-foreground">
                        {code} ({cName})
                      </option>
                    ))}
                  </select>
                  <Input
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                    placeholder="9876543210"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90 flex items-center gap-1.5">
                  <Mail className="size-4 text-muted-foreground" /> Email Address
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. ramesh@mahadevsteel.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90">GSTIN / Tax ID</label>
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
        <Card className="shadow-sm border-border/50 !py-0 !gap-0">
          <CardHeader className="border-b bg-muted/30 py-2.5 !pb-2.5 px-6">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-card-foreground">
              <Building className="size-4 text-muted-foreground" /> Registered Business Address
            </CardTitle>
            <CardDescription>Specify the legal and physical location of the supplier.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90">Address Line 1</label>
                <Input
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Plot / Door No / Building / Road"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90">Address Line 2</label>
                <Input
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Area / Locality / Landmark"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90">City / Town</label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mumbai"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90">State / Province</label>
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Maharashtra"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90">PIN / ZIP Code</label>
                <Input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="e.g. 400001"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/90">Country</label>
                <select
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                >
                  {Object.keys(countryDialCodes).map((cName) => (
                    <option key={cName} value={cName} className="bg-background text-foreground">
                      {cName}
                    </option>
                  ))}
                </select>
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
