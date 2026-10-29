"use client";

import { cn } from "@/lib/utils";
import { Users, Clock, Settings2, Calendar, RefreshCw, Trophy } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LeaveRequestDialog } from "./leave-request-dialog";
import { InviteUserForm } from "./create-user";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { useTeamQueryStore } from "@/lib/store/team-query-store";

interface TeamNavProps {
    workspaceId: string;
    isAdmin: boolean;
}

export function TeamNav({ workspaceId, isAdmin }: TeamNavProps) {
    const pathname = usePathname();
    const baseUrl = `/w/${workspaceId}/team`;
    const { isQuerying } = useTeamQueryStore();

    const navTabs = [
        {
            name: "Members",
            href: baseUrl,
            icon: Users,
            activeMatch: (path: string) => path === baseUrl
        },
        {
            name: "Attendance",
            href: `${baseUrl}/attendance`,
            icon: Clock,
            activeMatch: (path: string) => path === `${baseUrl}/attendance`
        },
        {
            name: "Leaves",
            href: `${baseUrl}/leaves`,
            icon: Calendar,
            activeMatch: (path: string) => path === `${baseUrl}/leaves`
        },
        {
            name: "Points",
            href: `${baseUrl}/points`,
            icon: Trophy,
            activeMatch: (path: string) => path === `${baseUrl}/points`
        },
        ...(isAdmin ? [{
            name: "Settings",
            href: `${baseUrl}/settings`,
            icon: Settings2,
            activeMatch: (path: string) => path === `${baseUrl}/settings`
        }] : []),
    ];

    return (
        <PageHeader
            title="Teams"
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
                <>
                    <div
                        title={isQuerying ? "Refreshing..." : "Up to date"}
                        className="flex size-10 items-center justify-center glass rounded-full"
                    >
                        <RefreshCw className={cn("size-4 transition-all duration-500", isQuerying ? "text-primary-ink animate-spin" : "text-muted-foreground")} />
                    </div>
                    <LeaveRequestDialog workspaceId={workspaceId}>
                        <Button variant="outline" className="uppercase tracking-wide shadow-md">
                            <Clock className="size-4" />
                            Apply Leave
                        </Button>
                    </LeaveRequestDialog>

                    {isAdmin && (
                        <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin}>
                            <Button variant="outline" className="uppercase tracking-wide shadow-md">
                                <Users className="size-4" />
                                Invite Member
                            </Button>
                        </InviteUserForm>
                    )}
                </>
            }
        />
    );
}
