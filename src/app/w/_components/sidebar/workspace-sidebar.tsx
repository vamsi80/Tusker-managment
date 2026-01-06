import * as React from "react";
import { NavUser } from "./footer/nav-user";
import { NavMain } from "./header/nav-main";
import { NavProjectsAsync } from "./projectsList/nav-projects-async";
import { NavWorkspacesSelector } from "./header/nav-workspaces-selector";
import { IconCheckupList, IconDashboard, IconReplaceUser, IconSettings, IconTruck, IconUsersPlus } from "@tabler/icons-react";
import { NavFooter } from "./footer/nav-footer";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { NavProjectsSkeleton } from "./projectsList/projects-skeleton";
import { WorkspacesType } from "@/data/workspace/get-workspaces";

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
  const mainNavItems = [
    { title: "Dashboard", url: `/w/${workspaceId}`, icon: IconDashboard },
    { title: "Team", url: `/w/${workspaceId}/team`, icon: IconUsersPlus },
    { title: "Tasks", url: `/w/${workspaceId}/tasks`, icon: IconCheckupList },
    { title: "Material", url: `/w/${workspaceId}/material`, icon: IconTruck },
    { title: "Vendor", url: `/w/${workspaceId}/vendor`, icon: IconReplaceUser },
  ];

  const footerNavItems = [
    { title: "Settings", url: `/w/${workspaceId}/settings`, icon: IconSettings },
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
        <NavMain items={mainNavItems} workspaceId={workspaceId} />

        <React.Suspense fallback={<NavProjectsSkeleton />}>
          <NavProjectsAsync workspaceId={workspaceId} />
        </React.Suspense>
      </SidebarContent>

      <SidebarFooter className="p-2 gap-2">
        <NavFooter items={footerNavItems} />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
