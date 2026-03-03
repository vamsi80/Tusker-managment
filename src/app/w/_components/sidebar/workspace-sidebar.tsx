import * as React from "react";
import { NavUser } from "./footer/nav-user";
import { NavMain } from "./header/nav-main";
import { NavProjectsAsync } from "./projectsList/nav-projects-async";
import { NavWorkspacesSelector } from "./header/nav-workspaces-selector";
import { NavFooter } from "./footer/nav-footer";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { NavProjectsSkeleton } from "./projectsList/projects-skeleton";
import { WorkspacesType } from "@/data/workspace/get-workspaces";
import { QuickCreateSubTaskAsync, QuickCreateSubTaskSkeleton } from "./header/quick-create-subtask-async";
import { Suspense } from "react";

interface iAppProps {
  data: WorkspacesType;
  workspaceId: string;
}

/**
 * Main application sidebar component.
 * Organizes navigation into workspaces, main features, projects, and user settings.
 */
export async function AppSidebar({ data, workspaceId, ...props }: React.ComponentProps<typeof Sidebar> & iAppProps) {
  // Navigation items for the main workspace section
  // Navigation items — Procurement, Inventory & Orders are disabled for release-core-v1
  const mainNavItems: Array<{
    title: string;
    url: string;
    icon?: "IconDashboard" | "IconUsersPlus" | "IconCheckupList" | "IconSettings";
  }> = [
      { title: "Dashboard", url: `/w/${workspaceId}`, icon: "IconDashboard" },
      { title: "Team", url: `/w/${workspaceId}/team`, icon: "IconUsersPlus" },
      { title: "Tasks", url: `/w/${workspaceId}/tasks`, icon: "IconCheckupList" },
    ];

  const footerNavItems: Array<{
    title: string;
    url: string;
    icon: "IconSettings" | "IconReport";
  }> = [
      { title: "Reports", url: `/w/${workspaceId}/reports`, icon: "IconReport" },
      { title: "Settings", url: `/w/${workspaceId}/settings`, icon: "IconSettings" },
    ];

  return (
    <Sidebar collapsible="offcanvas" {...props} className="border-r border-border/50">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavWorkspacesSelector data={data} workspaceId={workspaceId} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <NavMain
          items={mainNavItems}
          workspaceId={workspaceId}
          quickCreateButton={
            <Suspense fallback={<QuickCreateSubTaskSkeleton />}>
              <QuickCreateSubTaskAsync workspaceId={workspaceId} />
            </Suspense>
          }
        />

        <React.Suspense fallback={<NavProjectsSkeleton />}>
          <NavProjectsAsync workspaceId={workspaceId} />
        </React.Suspense>
      </SidebarContent>

      <SidebarFooter className="px-3">
        <NavFooter items={footerNavItems} />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
