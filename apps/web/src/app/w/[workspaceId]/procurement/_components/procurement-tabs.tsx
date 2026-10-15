"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { LayoutGrid, FileText, Package, Workflow, Receipt } from "lucide-react";

interface ProcurementTabsProps {
  workspaceId: string;
  workspaceName: string;
}

export function ProcurementTabs({ workspaceId, workspaceName }: ProcurementTabsProps) {
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
          items={viewTabs.map((tab) => ({ label: tab.name, href: tab.href, icon: tab.icon, active: tab.isActive }))}
        />
      }
    />
  );
}
