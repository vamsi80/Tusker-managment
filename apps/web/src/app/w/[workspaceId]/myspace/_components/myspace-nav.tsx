"use client";

import { ListTodo, User, MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { usePathname } from "next/navigation";

export function MySpaceNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();

  const baseUrl = `/w/${workspaceId}/myspace`;

  const navTabs = [
    { id: "info", name: "My Info", href: baseUrl, icon: User },
    { id: "todo", name: "To-Do", href: `${baseUrl}/to-do`, icon: ListTodo },
    { id: "conversations", name: "Chat", href: `${baseUrl}/conversations`, icon: MessagesSquare },
  ];

  // Chat owns the full height it is given: its own list and thread panels are
  // the navigation, so the Personal tab strip only steals a row from them.
  if (pathname.startsWith(`${baseUrl}/conversations`)) return null;

  return (
    <PageHeader
      title="My Space"
      className="mb-5"
      nav={
        <SegmentedNav
          items={navTabs.map((tab) => ({
            label: tab.name,
            href: tab.href,
            icon: tab.icon,
            active: pathname === tab.href || (tab.id !== "info" && pathname.startsWith(tab.href)),
          }))}
        />
      }
    />
  );
}
