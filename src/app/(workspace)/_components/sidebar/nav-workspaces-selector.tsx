"use client";

import React, { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../../../../components/ui/sidebar";
import { useParams, useRouter } from "next/navigation";
import { UserWorkspacesType } from "@/app/data/workspace/get-user-workspace";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface iAppProps {
  data: UserWorkspacesType;
}

export const NavWorkspacesSelector: React.FC<iAppProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams(); // <<< get slug from URL
  const urlSlug = (params.slug as string | undefined) ?? undefined;

  const [workspaces, setWorkspaces] = useState<UserWorkspacesType>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // keep workspaceSlug in state for optimistic UI, but always prefer urlSlug when available
  const [workspaceSlug, setWorkspaceSlug] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      if (!data) {
        setWorkspaces([]);
        setWorkspaceSlug(undefined);
      } else {
        setWorkspaces(data);
        const firstSlug = data[0]?.slug ?? data[0]?.id;
        // prefer URL slug if present, otherwise default to first workspace
        setWorkspaceSlug((prev) => prev ?? urlSlug ?? firstSlug);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }, [data, urlSlug]);

  // keep state synced when route param changes (handles back/forward & external navigation)
  useEffect(() => {
    if (urlSlug && urlSlug !== workspaceSlug) {
      setWorkspaceSlug(urlSlug);
    }
  }, [urlSlug, workspaceSlug]);

  function onWorkspaceSelect(slug: string) {
    if (!slug) return;
    // optimistic UI: highlight immediately
    setWorkspaceSlug(slug);
    // navigate (replace if you don't want a history entry)
    router.push(`/${slug}`);
  }

  const current =
    workspaces.find((w) => w.slug && w.slug === (urlSlug ?? workspaceSlug)) ??
    workspaces.find((w) => w.id === (urlSlug ?? workspaceSlug)) ??
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
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={`https://avatar.vercel.sh/${current?.slug}`} alt={current?.name} />
                <AvatarFallback className="rounded-lg">
                  {current?.name && current?.name.length > 0
                    ? current?.name.charAt(0).toLocaleUpperCase()
                    : (current?.slug ?? current?.id ?? "W").charAt(0).toLocaleUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col ml-2">
                <div className="font-semibold text-muted-foreground">
                  {current?.name ?? (loading ? "Loading…" : "No Workspaces")}
                </div>
                <div className="text-xs text-muted-foreground/70">
                  {loading ? "Loading…" : `${current?.members?.length ?? 0} member${(current?.members?.length ?? 0) === 1 ? "" : "s"}`}
                </div>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          {/* disable portal so CSS custom property is in same DOM context */}
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            sideOffset={5}
          >
            {loading && <DropdownMenuItem>Loading…</DropdownMenuItem>}
            {error && <DropdownMenuItem>{error}</DropdownMenuItem>}
            {!loading && !workspaces?.length && <DropdownMenuItem>No workspaces</DropdownMenuItem>}

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
                        {ws?.name ?? (loading ? "Loading…" : "No Workspaces")}
                      </div>
                      <div className="text-xs text-muted-foreground/70">
                        {loading ? "Loading…" : `${ws.members?.length ?? 0} member${(ws?.members?.length ?? 0) === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  </div>
                  {routeKey === workspaceSlug && <Check className="ml-auto" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2 cursor-pointer"
              onSelect={(e) => {
                e.preventDefault();        // prevent dropdown from closing instantly (optional)
                router.push(`/create-workspace`);
              }}
            >
              <Plus className="size-4" />
              <span className="text-muted-foreground font-medium">Create Workspace</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
