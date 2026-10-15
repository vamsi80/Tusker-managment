"use client";

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
    if (segment === "projectSettings") label = "Project Settings";
    if (segment === "editProject") label = "Edit Project";
    
    // UUID detection (simple check for length or dashes)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) || segment.length > 20;

    if (segment === workspaceId) {
        const currentWorkspace = data.workspaces?.workspaces?.find((w: any) => w.id === workspaceId);
        label = currentWorkspace?.name || "Dashboard";
    } else if (isUUID && pathSegments[index - 1] === "conversations") {
        label = "Chat";
    } else if (isUUID && pathSegments[index - 1] === "projectSettings") {
        label = "Permissions";
    } else if (isUUID && pathSegments[index - 1] === "editProject") {
        label = "Edit";
    } else if (isUUID) {
        label = "Details";
    }
    
    return { label, url, isLast };
  });

  return (
    <header className="sticky top-0 z-[40] flex min-h-(--header-height) h-auto w-full shrink-0 items-center border-b border-white/60 bg-background/60 backdrop-blur-md dark:border-border/50 py-4">
      <div className="flex w-full items-center gap-2 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
            {/* On desktop the collapse button lives in the sidebar header. */}
            <SidebarTrigger className="-ml-1 md:hidden" />
            <Breadcrumb className="hidden md:block">
                <BreadcrumbList className="text-base">
                    {breadcrumbs.map((crumb, i) => (
                        <React.Fragment key={crumb.url}>
                            <BreadcrumbItem>
                                {crumb.isLast ? (
                                    <BreadcrumbPage className="font-medium text-foreground">
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
