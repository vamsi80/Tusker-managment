import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationCenter } from "./notification-center"
import ThemeToggle from "../../../../../components/ui/theme-toggle"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-[40] w-full flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium text-foreground">White Tusker</h1>
        <div className="ml-auto flex items-center gap-3">
          <NotificationCenter />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
