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
import { CreateProjectForm } from "../../[workspaceId]/[projectId]/_components/create-project-form"
import { WorkspaceProjectsType } from "@/app/data/workspace/get-workspace-members"
import { useWorkspaceId } from "@/hooks/use-workspace-id"

interface iAppProps {
  members: WorkspaceProjectsType["workspaceMembers"];
}
export function NavProjects() {
  const { isMobile } = useSidebar();
  const pathname = usePathname();

  return (

    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        <div className="flex text-sm items-center justify-between w-full cursor-pointer">
          <span>Projects</span>

          <CreateProjectForm />
        </div>
      </SidebarGroupLabel>
      {/* <SidebarMenu>
        {projects?.map((proj) => {
          const href = `${workspaceId}/${proj.id}`;
          return (
            <SidebarMenuItem key={proj?.id}>
              <SidebarMenuButton>
                <a
                  href={href}
                  className={
                    pathname === href
                      ? "text-blue-500 font-semibold"
                      : "text-muted-foreground"
                  }
                >
                  {proj?.name}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu> */}
    </SidebarGroup>
  )
}
