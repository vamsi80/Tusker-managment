"use client"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { WorkspaceProjectsType } from "@/app/data/workspace/get-workspace-members"
import Link from "next/link"
import { CreateProjectForm } from "../../[workspaceId]/[projectId]/_components/create-project-form"

interface iAppProps {
  members: WorkspaceProjectsType["workspaceMembers"];
  projects: WorkspaceProjectsType["projects"]
  workspaceId: string
}
export function NavProjects({ members, projects, workspaceId }: iAppProps) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();

  return (

    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        <div className="flex text-sm items-center justify-between w-full cursor-pointer">
          <span>Projects</span>
          <CreateProjectForm members={members} workspaceId={workspaceId} />
        </div>
      </SidebarGroupLabel>
      <SidebarMenu>
        {projects?.map((proj) => {
          const href = `/w/${workspaceId}/${proj.id}`;
          return (
            <SidebarMenuItem key={proj.id}>
              <SidebarMenuButton asChild>
                <Link
                  href={href}
                  className={
                    pathname === href
                      ? "text-blue-500 font-semibold"
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
    </SidebarGroup>
  )
}
