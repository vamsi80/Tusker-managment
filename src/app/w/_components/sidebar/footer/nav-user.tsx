"use client"

import { LayoutDashboard, MoreVertical, LogOut, HomeIcon, Tv2, ListTodo } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { authClient } from "@/lib/auth-client"
import Link from "next/link"
import { useSignout } from "@/hooks/use-signout"
import { useMounted } from "@/hooks/use-mounted"
import { useSafeNavigation } from "@/hooks/use-safe-navigation"
import { usePathname, useSearchParams } from "next/navigation"
import { getUserDisplayInitial, getUserDisplayName } from "@/lib/user-display-name"

export function NavUser({ workspaceId }: { workspaceId?: string }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const handleSignOut = useSignout();
  const mounted = useMounted();
  const router = useSafeNavigation();

  const { data: session, isPending } = authClient.useSession();

  const openMySpace = () => {
    if (!workspaceId) return;
    router.push(`/w/${workspaceId}/myspace`);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  if (isPending) {
    return null;
  }

  const displayUser = session?.user as {
    surname?: string | null;
    name?: string | null;
    email?: string | null;
  } | undefined;
  const displayName = getUserDisplayName(displayUser);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {mounted && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage src={session?.user?.image || ""} alt={displayName} />
                  <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                    {getUserDisplayInitial(displayUser)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {displayName}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {session?.user?.email}
                  </span>
                </div>
                <MoreVertical className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={session?.user?.image || ""} alt={displayName} />
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                      {getUserDisplayInitial(displayUser)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {displayName}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {session?.user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link
                    href="/"
                    onClick={(e) => {
                      if (isMobile) {
                        setOpenMobile(false);
                      }
                      e.preventDefault();
                      router.push("/");
                    }}
                  >
                    <HomeIcon />
                    Homepage
                  </Link>
                </DropdownMenuItem>
                {workspaceId && (
                  <DropdownMenuItem onClick={openMySpace} className="cursor-pointer">
                    <ListTodo />
                    My Space
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSignOut(workspaceId)} className="cursor-pointer">
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

