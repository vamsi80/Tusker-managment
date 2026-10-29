"use client";

import { cn } from "@/lib/utils";
import { AlignLeft, History, RefreshCw, SquareCheck, Building2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

interface SettingsNavProps {
    workspaceId: string;
}

export function SettingsNav({ workspaceId }: SettingsNavProps) {
    const pathname = usePathname();
    const router = useSafeNavigation();
    const { data } = useWorkspaceLayout();
    const isPending = router.isNavigating;
    const baseUrl = `/w/${workspaceId}/settings`;

    // Permissions is OWNER/ADMIN only. Hiding the tab is cosmetic — the page and
    // the save action re-check server-side, so a typed URL gets nothing.
    const role = data?.permissions?.workspaceRole;
    const canManagePermissions = role === "OWNER" || role === "ADMIN";

    const navTabs = [
        {
            name: "General",
            href: baseUrl,
            icon: AlignLeft,
            activeMatch: (path: string) => path === baseUrl
        },
        ...(canManagePermissions ? [{
            name: "Department",
            href: `${baseUrl}/departments`,
            icon: Building2,
            activeMatch: (path: string) => path === `${baseUrl}/departments`
        }, {
            name: "Permissions",
            href: `${baseUrl}/permissions`,
            icon: SquareCheck,
            activeMatch: (path: string) => path === `${baseUrl}/permissions`
        }] : []),
        {
            name: "Activity Log",
            href: `${baseUrl}/activity`,
            icon: History,
            activeMatch: (path: string) => path === `${baseUrl}/activity`
        },
    ];

    return (
        <PageHeader
            title="Settings"
            className="mb-5"
            nav={
                <SegmentedNav
                    items={navTabs.map((tab) => ({
                        label: tab.name,
                        href: tab.href,
                        icon: tab.icon,
                        active: tab.activeMatch(pathname),
                    }))}
                />
            }
            actions={
                <div className="flex size-10 items-center justify-center glass rounded-full">
                    <RefreshCw className={cn("size-4 transition-all duration-500", isPending ? "text-primary-ink animate-spin" : "text-muted-foreground")} />
                </div>
            }
        />
    );
}
