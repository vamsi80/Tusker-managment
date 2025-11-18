"use client";

import React, { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { WorkspaceAvatar } from "@/app/workspace/_components/workspace-avatar";
import { useRouter } from "next/navigation";
import { UserWorkspacesType } from "@/app/data/workspace/get-user-workspace";

interface iAppProps {
  data: UserWorkspacesType;
}

export const NavWorkspacesSelector: React.FC<iAppProps> = ({ data }) => {
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
    router.push(`/workspace/${slug}`);
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
              <WorkspaceAvatar name={current?.name ?? "W"} />
              <div className="flex flex-col ml-2">
                <div className="font-semibold text-muted-foreground">
                  {current?.name ?? (loading ? "Loading…" : "No Workspaces")}
                </div>
                <div className="text-xs text-muted-foreground/70">
                  {loading ? "Loading…" : `${workspaces?.length ?? 0} workspace${(workspaces?.length ?? 0) === 1 ? "" : "s"}`}
                </div>
              </div>

              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
            {loading && <DropdownMenuItem>Loading…</DropdownMenuItem>}
            {error && <DropdownMenuItem>{error}</DropdownMenuItem>}
            {!loading && !workspaces?.length && <DropdownMenuItem>No workspaces</DropdownMenuItem>}

            {workspaces?.map((ws) => {
              const routeKey = ws.slug ?? ws.id;
              return (
                <DropdownMenuItem key={ws.id} onSelect={() => onWorkspaceSelect(routeKey)}>
                  <div className="flex flex-row items-center gap-2">
                    <WorkspaceAvatar name={ws.name} />
                    <p>{ws.name}</p>
                  </div>

                  {routeKey === workspaceSlug && <Check className="ml-auto" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
