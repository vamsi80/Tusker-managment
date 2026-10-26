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
  SidebarTrigger,
  useSidebar
} from "@/components/ui/sidebar";
import { NavUser } from "./footer/nav-user";
import { NavProjects } from "./projectsList/nav-projects";
import { NavWorkspacesSelector } from "./header/nav-workspaces-selector";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";
import { LayoutGrid, Users, FileCheck2, Truck, CalendarDays, MessagesSquare, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";
import { can } from "@tusker/core/lib/constants/capabilities";

/**
 * Main application sidebar component (Client Side).
 * Optimized to match Shadcn premium standards for nesting and grouping.
 */
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { data, workspaceId } = useWorkspaceLayout();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useSafeNavigation();
  const { workspaces, permissions } = data;

  const capabilities = permissions?.capabilities;

  const mainNavItems = [
    { id: "dashboard", title: "Dashboard", url: `/w/${workspaceId}`, icon: LayoutGrid },
    { id: "calendar", title: "Calendar", url: `/w/${workspaceId}/calendar`, icon: CalendarDays },
    { id: "team", title: "Team", url: `/w/${workspaceId}/team`, icon: Users },
    { id: "tasks", title: "Tasks", url: `/w/${workspaceId}/tasks`, icon: FileCheck2 },
    { id: "chat", title: "Messages", url: `/w/${workspaceId}/myspace/conversations`, icon: MessagesSquare },
    { id: "procurement", title: "Procurement", url: `/w/${workspaceId}/procurement`, icon: Truck, capability: "procurement:view" as const },
    { id: "vendors", title: "Suppliers / Contractors", url: `/w/${workspaceId}/vendors`, icon: Users, capability: "vendors:view" as const },
    { id: "settings", title: "Settings", url: `/w/${workspaceId}/settings`, icon: Settings },
  ].filter((item) => !item.capability || can(capabilities, item.capability));

  return (
    <Sidebar collapsible="icon" {...props} className="border-none">
      <SidebarHeader className="min-h-(--header-height) h-auto flex-row items-center py-4">
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <NavWorkspacesSelector data={workspaces as any} workspaceId={workspaceId} />
        </div>
        <SidebarTrigger className="text-muted-foreground" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="border-b border-border/70 pb-4">
          <SidebarGroupLabel className="px-2 text-sm font-normal text-muted-foreground">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    variant="glass"
                    isActive={item.id === "dashboard" ? pathname === item.url : pathname.startsWith(item.url)}
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

        <NavProjects
          workspaceId={workspaceId}
          isAdmin={permissions?.isWorkspaceAdmin ?? false}
          canCreateProject={permissions?.canCreateProject ?? permissions?.isWorkspaceAdmin ?? false}
          userRole={permissions?.workspaceRole ?? undefined}
          currentUserId={permissions?.userId ?? undefined}
        />
      </SidebarContent>

      <SidebarFooter>
        <NavUser workspaceId={workspaceId} />
      </SidebarFooter>
    </Sidebar>
  );
}
