"use client";

import { ListTodo, LayoutGrid, User } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MySpaceNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();

  const baseUrl = `/w/${workspaceId}/myspace`;

  const navTabs = [
    { id: "info", name: "My Info", href: baseUrl, icon: User },
    { id: "todo", name: "Todo's", href: `${baseUrl}/todos`, icon: ListTodo },
  ];

  return (
    <div className="border-b pt-4 mb-6">
      <div className="flex h-11 items-center gap-4 overflow-x-auto scrollbar-hide px-2">
        <div className="flex items-center gap-2 pr-4 border-r border-border/50 h-6 flex-shrink-0">
          <LayoutGrid className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Personal</span>
        </div>

        {navTabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "flex h-full items-center gap-2 border-b-2 px-1 text-sm font-medium transition-all hover:text-primary whitespace-nowrap cursor-pointer",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground/60")} />
              <span>{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
