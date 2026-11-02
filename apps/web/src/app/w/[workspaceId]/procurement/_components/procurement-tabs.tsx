"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { LayoutGrid, FileText, Package, Workflow, Receipt, Calculator, BookOpen, Users } from "lucide-react";
import { can, type CapabilityMap, type Capability } from "@tusker/core/lib/constants/capabilities";

interface ProcurementTabsProps {
  workspaceId: string;
  workspaceName: string;
  /** Hides tabs the member can't open. Missing = only the original tabs. */
  capabilities?: CapabilityMap | null;
}

export function ProcurementTabs({ workspaceId, workspaceName, capabilities }: ProcurementTabsProps) {
  const pathname = usePathname();
  const baseUrl = `/w/${workspaceId}/procurement`;

  const viewTabs = [
    {
      name: "Dashboard",
      href: baseUrl,
      icon: LayoutGrid,
      isActive: pathname === baseUrl,
    },
    {
      name: "Indents",
      href: `${baseUrl}/indents`,
      icon: FileText,
      isActive: pathname.startsWith(`${baseUrl}/indents`),
    },
    {
      name: "POs",
      href: `${baseUrl}/pos`,
      icon: Receipt,
      isActive: pathname.startsWith(`${baseUrl}/pos`),
    },
    {
      name: "BOQ",
      href: `${baseUrl}/boq`,
      icon: Calculator,
      isActive: pathname.startsWith(`${baseUrl}/boq`),
      capability: "boq:view" as Capability,
    },
    {
      name: "Rate sheet",
      href: `${baseUrl}/rate-sheet`,
      icon: BookOpen,
      isActive: pathname.startsWith(`${baseUrl}/rate-sheet`),
      capability: "ratesheet:view" as Capability,
    },
    {
      // Vendor pages stay at /vendors (the desktop app imports them by path).
      name: "Vendors",
      href: `/w/${workspaceId}/vendors`,
      icon: Users,
      isActive: false,
      capability: "vendors:view" as Capability,
    },
    {
      name: "Materials",
      href: `${baseUrl}/materials`,
      icon: Package,
      isActive: pathname.startsWith(`${baseUrl}/materials`),
    },
    {
      name: "RFQs",
      href: `${baseUrl}/rfqs`,
      icon: Workflow,
      isActive: pathname.startsWith(`${baseUrl}/rfqs`),
    },
  ];

  return (
    <PageHeader
      title="Procurement"
      nav={
        <SegmentedNav
          items={viewTabs.filter((tab) => !("capability" in tab) || can(capabilities, tab.capability as Capability)).map((tab) => ({ label: tab.name, href: tab.href, icon: tab.icon, active: tab.isActive }))}
        />
      }
    />
  );
}
