import * as React from "react";
import { NavUser } from "./nav-user";
import { NavMain } from "./nav-main";
import { NavProjectsAsync } from "./nav-projects-async";
import { NavWorkspacesSelector } from "./nav-workspaces-selector";
import { IconDashboard, IconPackageImport, IconTruck, IconUsersPlus } from "@tabler/icons-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { NavProjectsSkeleton } from "./projects-skeleton";
import { UserWorkspacesType } from "@/data/user/get-user-workspace";

interface iAppProps {
  data: UserWorkspacesType;
  workspaceId: string;
}

export async function AppSidebar({ data, workspaceId, ...props }: React.ComponentProps<typeof Sidebar> & iAppProps) {
  const mainNavItems = [
    { title: "Dashboard", url: `/w/${workspaceId}`, icon: IconDashboard },
    { title: "Team", url: `/w/${workspaceId}/team`, icon: IconUsersPlus },
    { title: "Vendor", url: `/w/${workspaceId}/vendor`, icon: IconTruck },
    { title: "Procurement", url: `/w/${workspaceId}/procurement`, icon: IconPackageImport },
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavWorkspacesSelector data={data} workspaceId={workspaceId} />
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={mainNavItems} />
        <React.Suspense fallback={<NavProjectsSkeleton />}>
          <NavProjectsAsync workspaceId={workspaceId} />
        </React.Suspense>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
