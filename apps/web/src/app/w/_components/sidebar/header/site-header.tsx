"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import ThemeToggle from "../../../../../components/ui/theme-toggle";
import { NotificationCenterWrapper as NotificationCenter } from "./notification-center-wrapper";
import { MarkAttendanceButton } from "./mark-attendance-button";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { 
    Breadcrumb, 
    BreadcrumbItem, 
    BreadcrumbLink, 
    BreadcrumbList, 
    BreadcrumbPage, 
    BreadcrumbSeparator 
} from "@/components/ui/breadcrumb";
import { usePathname } from "next/navigation";
import React from "react";

export function SiteHeader() {
  const { data, workspaceId } = useWorkspaceLayout();
  const pathname = usePathname();
  
  // Dynamic Breadcrumb logic
  const pathSegments = pathname.split("/").filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, index) => {
    const url = `/${pathSegments.slice(0, index + 1).join("/")}`;
    const isLast = index === pathSegments.length - 1;
    
    // Formatting logic for labels
    let label = segment.charAt(0).toUpperCase() + segment.slice(1);
    
    if (segment === "w") label = "Workspace";
    if (segment === "p") label = "Projects";
    if (segment === "myspace") label = "My Space";
    if (segment === "conversations") label = "Messages";
    
    // UUID detection (simple check for length or dashes)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) || segment.length > 20;

    if (segment === workspaceId) {
        const currentWorkspace = data.workspaces?.workspaces?.find((w) => w.id === workspaceId);
        label = currentWorkspace?.name || "Dashboard";
    } else if (isUUID && pathSegments[index - 1] === "conversations") {
        label = "Chat";
    } else if (isUUID) {
        label = "Details";
    }
    
    return { label, url, isLast };
  });

  return (
    <header className="sticky top-0 z-[40] flex min-h-(--header-height) h-auto w-full shrink-0 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2">
      <div className="flex w-full items-center gap-2 px-4">
        <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
                orientation="vertical"
                className="mr-2 h-4"
            />
            <Breadcrumb className="hidden md:block">
                <BreadcrumbList>
                    {breadcrumbs.map((crumb, i) => (
                        <React.Fragment key={crumb.url}>
                            <BreadcrumbItem>
                                {crumb.isLast ? (
                                    <BreadcrumbPage className="font-semibold text-foreground">
                                        {crumb.label}
                                    </BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink href={crumb.url} className="text-muted-foreground hover:text-foreground transition-colors">
                                        {crumb.label}
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                            {!crumb.isLast && <BreadcrumbSeparator />}
                        </React.Fragment>
                    ))}
                </BreadcrumbList>
            </Breadcrumb>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <MarkAttendanceButton workspaceId={workspaceId} />
          <NotificationCenter
            workspaceId={workspaceId}
          />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
