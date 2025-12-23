import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export function NavProjectsSkeleton() {
    return (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>
                <div className="flex text-sm items-center justify-between w-full mb-4">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-4" />
                </div>
            </SidebarGroupLabel>
            <SidebarMenu>
                {Array.from({ length: 5 }).map((_, i) => (
                    <SidebarMenuItem key={i}>
                        <SidebarMenuButton asChild>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-4 w-4" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}
