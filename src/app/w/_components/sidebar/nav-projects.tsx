"use client";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { WorkspaceProjectsType } from "@/app/data/workspace/get-workspace-members"
import Link from "next/link"

interface iAppProps {
  projects: WorkspaceProjectsType["projects"]
  workspaceId: string
}

export function NavProjects({ projects, workspaceId }: iAppProps) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {projects?.map((proj) => {
        const href = `/w/${workspaceId}/p/${proj.slug}`;
        return (
          <SidebarMenuItem key={proj.id}>
            <SidebarMenuButton asChild>
              <Link
                href={href}
                className={
                  pathname === href
                    ? "bg-foreground/10 dark:bg-foreground/20 border-foreground/50 hover:bg-foreground/20 dark:hover:bg-foreground/30 text-foreground hover:text-primary"
                    : "text-muted-foreground"
                }
              >
                {proj.name}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  )
}
