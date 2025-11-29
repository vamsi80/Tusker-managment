
import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserWorkspacesType } from "@/app/data/workspace/get-user-workspace";
import { NavProjects } from "./nav-projects";
import { NavUser } from "./nav-user";
import { NavWorkspacesSelector } from "./nav-workspaces-selector";
import { getWorkspacesProjectsByWorkspaceId, WorkspaceProjectsType } from "@/app/data/workspace/get-workspace-members";
import { NavMain } from "./nav-main";
import { IconCamera, IconChartBar, IconDashboard, IconDatabase, IconFileAi, IconFileDescription, IconFileWord, IconHelp, IconListDetails, IconReport, IconSearch, IconSettings } from "@tabler/icons-react";
import { Suspense } from "react";

const data1 = {
  navMain: [
    { title: "Dashboard", url: "/", icon: IconDashboard },
    { title: "Projects", url: "#", icon: IconListDetails },
    { title: "Team", url: "#", icon: IconChartBar },
  ],
  navClouds: [
    {
      title: "Capture",
      icon: IconCamera,
      isActive: true,
      url: "#",
      items: [
        { title: "Active Proposals", url: "#" },
        { title: "Archived", url: "#" },
      ],
    },
    {
      title: "Proposal",
      icon: IconFileDescription,
      url: "#",
      items: [
        { title: "Active Proposals", url: "#" },
        { title: "Archived", url: "#" },
      ],
    },
    {
      title: "Prompts",
      icon: IconFileAi,
      url: "#",
      items: [
        { title: "Active Proposals", url: "#" },
        { title: "Archived", url: "#" },
      ],
    },
  ],
  navSecondary: [
    { title: "Settings", url: "#", icon: IconSettings },
    { title: "Get Help", url: "#", icon: IconHelp },
    { title: "Search", url: "#", icon: IconSearch },
  ],
  documents: [
    {
      name: "Data Library",
      url: "#",
      icon: IconDatabase,
    },
    {
      name: "Reports",
      url: "#",
      icon: IconReport,
    },
    {
      name: "Word Assistant",
      url: "#",
      icon: IconFileWord,
    },
  ],
};

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
        {/* <NavMain items={data1.navMain} /> */}
        <Suspense fallback={<div>Loading Projects...</div>}>
          <NavProjects projects={projects} members={workspaceMembers} workspaceId={workspaceId} />
        </Suspense>
        {/* <NavSecondary items={data.navSecondary} className="mt-auto" /> */}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
