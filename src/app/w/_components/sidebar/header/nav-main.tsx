import { Icon, IconCirclePlusFilled } from "@tabler/icons-react"
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, } from "@/components/ui/sidebar"
import Link from "next/link";

/**
 * Main navigation items for the workspace sidebar.
 * Includes a Quick Create button and links to key workspace features.
 */
export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: Icon | undefined
  }[]
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Quick Create Task"
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear shadow-sm"
              asChild
            >
              <Link href="#" className="flex items-center gap-2">
                <IconCirclePlusFilled size={20} />
                <span className="font-semibold">Quick Create Task</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="mt-4">
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
                      {item.icon && <item.icon size={19} stroke={1.5} />}
                    </div>
                    <span className="font-medium">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
