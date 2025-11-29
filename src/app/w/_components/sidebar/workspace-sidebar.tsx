import * as React from "react";
import { NavUser } from "./nav-user";
import { NavMain } from "./nav-main";
import { NavProjects } from "./nav-projects";
import { NavWorkspacesSelector } from "./nav-workspaces-selector";
import { IconDashboard, IconUsersPlus } from "@tabler/icons-react";
import { UserWorkspacesType } from "@/app/data/workspace/get-user-workspace";
import { getWorkspacesProjectsByWorkspaceId } from "@/app/data/workspace/get-workspace-members";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

interface iAppProps {
  data: UserWorkspacesType;
  workspaceId: string;
}

export async function AppSidebar({ data, workspaceId, ...props }: React.ComponentProps<typeof Sidebar> & iAppProps) {
  const { workspaceMembers, projects } = await getWorkspacesProjectsByWorkspaceId(workspaceId);
  const mainNavItems = [
    { title: "Dashboard", url: `/w/${workspaceId}`, icon: IconDashboard },
    { title: "Team", url: `/w/${workspaceId}/team`, icon: IconUsersPlus },
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavWorkspacesSelector data={data} />
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={mainNavItems} />
        <NavProjects
          projects={projects}
          workspaceId={workspaceId}
          members={workspaceMembers}
        />
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
