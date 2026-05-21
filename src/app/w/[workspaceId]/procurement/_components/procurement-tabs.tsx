"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FileText, Package, Workflow } from "lucide-react";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";

interface ProcurementTabsProps {
  workspaceId: string;
  workspaceName: string;
}

export function ProcurementTabs({ workspaceId, workspaceName }: ProcurementTabsProps) {
  const pathname = usePathname();
  const router = useSafeNavigation();
  const isPending = router.isNavigating;
  const baseUrl = `/w/${workspaceId}/procurement`;

  const viewTabs = [
    {
      name: "Dashboard",
      href: baseUrl,
      icon: LayoutDashboard,
      isActive: pathname === baseUrl,
    },
    {
      name: "Indents",
      href: `${baseUrl}/indents`,
      icon: FileText,
      isActive: pathname.startsWith(`${baseUrl}/indents`),
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

  const handleTabChange = (href: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (isPending) return;
    router.push(href);
  };

  return (
    <div className={cn("border-b", isPending && "opacity-60 pointer-events-none transition-opacity")}>
      <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-2 px-3 border-r border-border/50 h-full flex-shrink-0">
          <span className="text-sm font-bold truncate max-w-[150px]">Procurement</span>
        </div>

        {viewTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              scroll={false}
              onClick={(e) => handleTabChange(tab.href, e)}
              className={cn(
                "flex h-full items-center gap-2 border-b-2 px-2 sm:px-3 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0 cursor-pointer",
                tab.isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-xs sm:text-xs">{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
