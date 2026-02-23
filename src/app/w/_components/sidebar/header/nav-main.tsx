"use client";

import {
  IconDashboard,
  IconUsersPlus,
  IconCheckupList,
  IconSettings,
} from "@tabler/icons-react";
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, } from "@/components/ui/sidebar"
import Link from "next/link";
import { usePathname } from "next/navigation";


// Icon mapping to resolve string names to actual components
// Note: Procurement icons (IconTruck, IconCube, IconBook) removed for release-core-v1
const iconMap = {
  IconDashboard,
  IconUsersPlus,
  IconCheckupList,
  IconSettings,
} as const;

type IconName = keyof typeof iconMap;

/**
 * Main navigation items for the workspace sidebar.
 * Includes a Quick Create button and links to key workspace features.
 */
export function NavMain({
  items,
  workspaceId,
  quickCreateButton,
}: {
  items: {
    title: string
    url: string
    icon?: IconName
  }[]
  workspaceId: string
  quickCreateButton?: React.ReactNode
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            {quickCreateButton}
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="mt-4">
          <SidebarMenu>
            {items.map((item) => {
              // Dashboard should only be active on exact match, others include nested routes
              const isActive = item.title === "Dashboard"
                ? pathname === item.url
                : pathname === item.url || pathname.startsWith(item.url + '/');
              const IconComponent = item.icon ? iconMap[item.icon] : null;

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    asChild
                    isActive={isActive}
                    className="transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
                  >
                    <Link href={item.url} className="flex items-center gap-2">
                      <div className="flex-shrink-0">
                        {IconComponent && <IconComponent size={19} stroke={1.5} />}
                      </div>
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
