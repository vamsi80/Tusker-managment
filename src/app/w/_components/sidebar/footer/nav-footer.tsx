import { Icon } from "@tabler/icons-react"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import Link from "next/link";

/**
 * Footer navigation items for the workspace sidebar.
 * Used for Settings and other secondary links.
 */
export function NavFooter({
    items,
}: {
    items: {
        title: string
        url: string
        icon: Icon
    }[]
}) {
    return (
        <SidebarMenu>
            {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                        tooltip={item.title}
                        asChild
                        className="transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
                    >
                        <Link href={item.url} className="flex items-center gap-2">
                            <div className="flex-shrink-0">
                                <item.icon size={19} stroke={1.5} />
                            </div>
                            <span className="font-medium">{item.title}</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
        </SidebarMenu>
    )
}
