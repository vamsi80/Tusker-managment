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
  const params = useParams(); // expects route like /[id]
  const urlId = (params.id as string | undefined) ?? undefined;

  const [workspaces, setWorkspaces] = useState<UserWorkspacesType>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // keep workspaceId in state for optimistic UI, but always prefer urlId when available
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      if (!data) {
        setWorkspaces([]);
        setWorkspaceId(undefined);
      } else {
        setWorkspaces(data);
        const firstId = data[0]?.id;
        // prefer existing state, then url, then first workspace id
        setWorkspaceId((prev) => prev ?? urlId ?? firstId);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }, [data, urlId]);

  // keep state synced when route param changes (handles back/forward & external navigation)
  useEffect(() => {
    if (urlId && urlId !== workspaceId) {
      setWorkspaceId(urlId);
    }
  }, [urlId, workspaceId]);

  function onWorkspaceSelect(id: string) {
    if (!id) return;
    // optimistic UI: highlight immediately
    setWorkspaceId(id);
    // navigate using id (creates a history entry)
    router.push(`/${id}`);
  }

  // choose current workspace: prefer a workspace whose id matches the urlId or local workspaceId
  const current =
    workspaces.find((w) => w.id === (urlId ?? workspaceId)) ??
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
                <AvatarImage src={`https://avatar.vercel.sh/${current?.id}`} alt={current?.name} />
                <AvatarFallback className="rounded-lg">
                  {current?.name && current?.name.length > 0
                    ? current?.name.charAt(0).toLocaleUpperCase()
                    : (current?.id ?? "W").charAt(0).toLocaleUpperCase()}
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
              const routeKey = ws.id; // <-- always use id
              return (
                <DropdownMenuItem key={ws.id} onSelect={() => onWorkspaceSelect(routeKey)}>
                  <div className="flex flex-row items-center gap-2">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage src={`https://avatar.vercel.sh/${ws.id}`} alt={ws.name} />
                      <AvatarFallback className="rounded-lg">
                        {ws.name && ws.name.length > 0 ? ws.name.charAt(0).toUpperCase() : ws.id.charAt(0).toUpperCase()}
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
                  {routeKey === workspaceId && <Check className="ml-auto" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2 cursor-pointer"
              onSelect={(e) => {
                e.preventDefault(); // prevent dropdown from closing instantly (optional)
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
