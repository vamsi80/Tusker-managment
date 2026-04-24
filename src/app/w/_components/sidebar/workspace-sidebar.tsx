"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
  useSidebar
} from "@/components/ui/sidebar";
import { NavUser } from "./footer/nav-user";
import { NavMain } from "./header/nav-main";
import { NavProjects } from "./projectsList/nav-projects";
import { NavWorkspacesSelector } from "./header/nav-workspaces-selector";
import { NavFooter } from "./footer/nav-footer";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { LayoutDashboard, Users, CheckSquare, Settings, BarChart3, AppWindow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";

/**
 * Main application sidebar component (Client Side).
 * Optimized to match Shadcn premium standards for nesting and grouping.
 */
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { data, workspaceId } = useWorkspaceLayout();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useSafeNavigation();
  const { workspaces, projects, permissions } = data;

  // Navigation items for the main workspace section
  const mainNavItems = [
    { id: "dashboard", title: "Dashboard", url: `/w/${workspaceId}`, icon: LayoutDashboard },
    { id: "team", title: "Team", url: `/w/${workspaceId}/team`, icon: Users },
    { id: "tasks", title: "Tasks", url: `/w/${workspaceId}/tasks`, icon: CheckSquare },
  ];

  const footerNavItems: Array<{
    title: string;
    url: string;
    icon: "Settings" | "BarChart3" | "LayoutDashboard";
  }> = [
      // {
      //   title: isOwner ? "Member Board" : "My Board",
      //   url: `/w/${workspaceId}/my-board`,
      //   icon: "LayoutDashboard"
      // },
      // { title: "Reports", url: `/w/${workspaceId}/reports`, icon: "BarChart3" },
      { title: "Settings", url: `/w/${workspaceId}/settings`, icon: "Settings" },
    ];

  return (
    <Sidebar collapsible="icon" {...props} className="border-r bg-sidebar border-border/50">
      <SidebarHeader className="h-(--header-height) justify-center border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <NavWorkspacesSelector data={workspaces as any} workspaceId={workspaceId} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url}
                    tooltip={item.title}
                    disabled={router.isNavigating}
                  >
                    <Link
                      href={item.url}
                      onClick={(e) => {
                        if (pathname !== item.url) {
                          if (isMobile) {
                            setOpenMobile(false);
                          }
                          e.preventDefault();
                          router.push(item.url);
                        }
                      }}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>


        <div className="py-2" />

        {projects && (
          <NavProjects
            projects={projects}
            workspaceId={workspaceId}
            isAdmin={permissions?.isWorkspaceAdmin ?? false}
            canCreateProject={permissions?.canCreateProject ?? permissions?.isWorkspaceAdmin ?? false}
            userRole={permissions?.workspaceRole}
            currentUserId={data.user?.id}
          />
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50 p-4">
        <NavFooter items={footerNavItems} />
        <div className="mt-4">
          <NavUser />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
