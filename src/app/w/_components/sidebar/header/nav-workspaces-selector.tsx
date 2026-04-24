// NavWorkspacesSelector.tsx
"use client";

import React, { useMemo, useTransition, useRef, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../../../../../components/ui/sidebar";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useMounted } from "@/hooks/use-mounted";
import type { WorkspacesType } from "@/data/workspace/get-workspaces";
import { apiClient } from "@/lib/api-client";

interface Props {
  data: WorkspacesType;
  workspaceId: string;
}

export const NavWorkspacesSelector: React.FC<Props> = ({ data, workspaceId }) => {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const [isPending, startTransition] = useTransition();
  const navigatingTo = useRef<string | null>(null);
  const mounted = useMounted();

  const [workspaces, setWorkspaces] = React.useState<any[]>(data?.workspaces ?? []);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = React.useState(false);

  // Sync state if initial data changes (though unlikely to happen on server)
  useEffect(() => {
    if (data?.workspaces?.length > 0) {
      setWorkspaces(data.workspaces);
    }
  }, [data?.workspaces]);

  // Client-side fetch if list is empty
  useEffect(() => {
    if (mounted && workspaces.length === 0 && !isLoadingWorkspaces) {
      setIsLoadingWorkspaces(true);
      apiClient.workspaces.getAll()
        .then((res) => {
          if (res?.workspaces) {
            setWorkspaces(res.workspaces);
          }
        })
        .catch((err) => console.error("Failed to load workspaces:", err))
        .finally(() => setIsLoadingWorkspaces(false));
    }
  }, [mounted, workspaces.length, isLoadingWorkspaces]);

  // find current workspace item from workspaceId or metadata
  const selected = useMemo(() => {
    const found = workspaces.find((w) => w.id === workspaceId);
    if (found) return found;

    return undefined; // Fallback handled in UI
  }, [workspaces, workspaceId]);

  useEffect(() => {
    if (!isPending) {
      navigatingTo.current = null;
    }
  }, [isPending]);

  const onWorkspaceSelect = (targetWorkspaceId: string) => {
    if (targetWorkspaceId === workspaceId || isPending || navigatingTo.current === targetWorkspaceId) return; // Already on this workspace or switching
    navigatingTo.current = targetWorkspaceId;
    if (isMobile) {
      setOpenMobile(false);
    }
    startTransition(() => {
      router.push(`/w/${targetWorkspaceId}`);
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {mounted && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className={`data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground ${isPending ? 'opacity-60' : ''}`}
              >
                {isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                      {(selected?.name ?? selected?.id ?? "W").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="flex flex-col ml-2">
                  <div className="font-semibold text-muted-foreground">
                    {isPending ? "Switching..." : (selected?.name || "Workspace")}
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
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => onWorkspaceSelect(routeKey)}
                    disabled={isPending}
                  >
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
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

export default NavWorkspacesSelector;
