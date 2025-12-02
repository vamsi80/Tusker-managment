"use client";

import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar, } from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { WorkspaceMembersType } from "@/app/data/workspace/get-workspace-members"
import Link from "next/link"
import { CreateProjectForm } from "../../[workspaceId]/p/_components/create-project-form";
import { Building2Icon } from "lucide-react";
import { UserProjectsType } from "@/app/data/user/get-user-projects";

interface iAppProps {
  projects: UserProjectsType
  members: WorkspaceMembersType
  workspaceId: string,
  isAdmin: boolean;
}

export function NavProjects({ projects, members, workspaceId, isAdmin }: iAppProps) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        <div className="flex text-sm items-center justify-between w-full cursor-pointer mb-4">
          <span>Projects</span>
          <CreateProjectForm members={members} workspaceId={workspaceId} isAdmin={isAdmin} />
        </div>
      </SidebarGroupLabel>
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
                  <Building2Icon />
                  {proj.name}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
