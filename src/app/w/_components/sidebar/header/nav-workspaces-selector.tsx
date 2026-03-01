// NavWorkspacesSelector.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../../../../../components/ui/sidebar";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { WorkspacesType } from "@/data/workspace/get-workspaces";

interface Props {
  // matches your getWorkspaces() return: WorkspacesResult
  data: WorkspacesType;
  workspaceId: string;
}

export const NavWorkspacesSelector: React.FC<Props> = ({ data, workspaceId }) => {
  const router = useRouter();
  const workspaces = data?.workspaces ?? []; // array of workspace items
  const [selected, setSelected] = useState<typeof workspaces[number] | undefined>(undefined);

  // find current workspace item from workspaceId or default to first item
  const current = useMemo(() => {
    if (!workspaces || workspaces.length === 0) return undefined;
    return (
      workspaces.find((w) => w.id === workspaceId) ??
      workspaces[0]
    );
  }, [workspaces, workspaceId]);

  useEffect(() => {
    setSelected(current);
  }, [current]);

  const onWorkspaceSelect = (workspaceId: string) => {
    const found = workspaces.find((w) => w.id === workspaceId);
    setSelected(found);
    router.push(`/w/${workspaceId}`);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {/* No external avatar, fallback to initials using Tailwind CSS */}
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                  {(selected?.name ?? selected?.id ?? "W").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col ml-2">
                <div className="font-semibold text-muted-foreground">
                  {selected?.name ?? "No Workspaces"}
                </div>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            sideOffset={5}
          >
            {!workspaces.length && <DropdownMenuItem>No workspaces</DropdownMenuItem>}

            {workspaces.map((ws) => {
              const routeKey = ws.id;
              return (
                <DropdownMenuItem key={ws.id} onClick={() => onWorkspaceSelect(routeKey)}>
                  <div className="flex flex-row items-center gap-2">
                    <Avatar className="h-8 w-8 rounded-lg">
                      {/* No external avatar, fallback to initials using Tailwind CSS */}
                      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                        {(ws.name ?? ws.id ?? "W").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col ml-2">
                      <div className="font-semibold text-muted-foreground">
                        {ws.name ?? ws.id}
                      </div>
                    </div>
                  </div>
                  {routeKey === workspaceId && <Check className="ml-auto" />}
                </DropdownMenuItem>
              );
            })}

            {/* <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                router.push(`/create-workspace`);
              }}
            >
              <Plus className="size-4" />
              <span className="text-muted-foreground font-medium">Create Workspace</span>
            </DropdownMenuItem> */}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

export default NavWorkspacesSelector;
