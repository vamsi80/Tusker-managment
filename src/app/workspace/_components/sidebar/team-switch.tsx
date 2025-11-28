"use client";

import React, { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../../../../components/ui/sidebar";
import { useRouter } from "next/navigation";
import { UserWorkspacesType } from "@/app/data/workspace/get-user-workspace";
import GradientAvatar from "../workspace-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface iAppProps {
  data: UserWorkspacesType;
}


export const NavWorkspacesSelectors: React.FC<iAppProps> = ({ data }) => {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<UserWorkspacesType>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceSlug, setWorkspaceSlug] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      if (!data) {
        setWorkspaces([]);
        setWorkspaceSlug(undefined);
      } else {
        setWorkspaces(data);
        const firstSlug = data[0]?.slug ?? data[0]?.id;
        setWorkspaceSlug((prev) => prev ?? firstSlug);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }, [data]);

  function onWorkspaceSelect(slug: string) {
    if (!slug) return;
    setWorkspaceSlug(slug);
    router.push(`/${slug}`);
  }

  // find currently selected workspace by slug (fall back to id if slug missing)
  const current =
    workspaces.find((w) => w.slug && w.slug === workspaceSlug) ??
    workspaces.find((w) => w.id === workspaceSlug) ??
    workspaces[0];
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={`https://avatar.vercel.sh/${current?.slug}`} alt={current?.name} />
                  <AvatarFallback className="rounded-lg">
                    {current?.name && current?.name.length > 0 ? current?.name.charAt(0).toUpperCase() : (current?.slug ?? current?.id).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{current?.name}</span>
                <span className="truncate text-xs">{current?.members?.length}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 items-center rounded-lg"
            align="start"
            // side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Workspaces
            </DropdownMenuLabel>
            {workspaces?.map((ws) => {
              const routeKey = ws.slug ?? ws.id;
              return (
                <DropdownMenuItem key={ws.id} onSelect={() => onWorkspaceSelect(routeKey)}>
                  <div className="flex flex-row items-center gap-2">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage src={`https://avatar.vercel.sh/${ws?.slug}`} alt={ws.name} />
                      <AvatarFallback className="rounded-lg">
                        {ws.name && ws.name.length > 0 ? ws.name.charAt(0).toUpperCase() : (ws.slug ?? ws.id).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col ml-2">
                      <div className="font-semibold text-muted-foreground">
                        {current?.name ?? (loading ? "Loading…" : "No Workspaces")}
                      </div>
                      <div className="text-xs text-muted-foreground/70">
                        {loading ? "Loading…" : `${workspaces?.length ?? 0} workspace${(workspaces?.length ?? 0) === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  </div>

                  {routeKey === workspaceSlug && <Check className="ml-auto" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <Plus className="size-4" />
              </div>
              <div className="text-muted-foreground font-medium">Add team</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}