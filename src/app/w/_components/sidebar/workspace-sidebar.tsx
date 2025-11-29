
import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserWorkspacesType } from "@/app/data/workspace/get-user-workspace";
import { NavProjects } from "./nav-projects";
import { NavUser } from "./nav-user";
import { NavWorkspacesSelector } from "./nav-workspaces-selector";
import { getWorkspacesProjectsByWorkspaceId } from "@/app/data/workspace/get-workspace-members";
import { NavMain } from "./nav-main";
import { CreateProjectForm } from "../../[workspaceId]/p/_components/create-project-form";

interface iAppProps {
  data: UserWorkspacesType;
  workspaceId: string;
}

export async function AppSidebar({ data, workspaceId, ...props }: React.ComponentProps<typeof Sidebar> & iAppProps) {
  const { workspaceMembers, projects } = await getWorkspacesProjectsByWorkspaceId(workspaceId);
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
        <NavMain workspaceId={workspaceId} />
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
