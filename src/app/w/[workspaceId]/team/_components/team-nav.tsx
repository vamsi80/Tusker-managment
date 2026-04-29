"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTransition } from "react";
import { Users, Clock, Settings2, Calendar } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LeaveRequestDialog } from "./leave-request-dialog";
import { InviteUserForm } from "./create-user";

interface TeamNavProps {
    workspaceId: string;
    isAdmin: boolean;
}

export function TeamNav({ workspaceId, isAdmin }: TeamNavProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const baseUrl = `/w/${workspaceId}/team`;

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
        ...(isAdmin ? [{
            name: "Settings",
            href: `${baseUrl}/settings`,
            icon: Settings2,
            activeMatch: (path: string) => path === `${baseUrl}/settings`
        }] : []),
    ];

    const handleNavChange = (href: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (isPending || pathname === href) return;
        startTransition(() => {
            router.push(href);
        });
    };

    return (
        <div className={cn("border-b mt-2", isPending && "opacity-60 pointer-events-none transition-opacity")}>
            <div className="flex h-10 items-center gap-4 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-2 px-3 border-r border-border/50 h-full flex-shrink-0">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-bold">Team</span>
                </div>

                {navTabs.map((tab) => {
                    const isActive = tab.activeMatch(pathname);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            prefetch={false}
                            onClick={(e) => handleNavChange(tab.href, e)}
                            className={cn(
                                "flex h-full items-center gap-2 border-b-2 px-2 sm:px-3 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0 cursor-pointer",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground"
                            )}
                        >
                            <Icon className="h-3 w-3" />
                            <span className="text-xs sm:text-xs">{tab.name}</span>
                        </Link>
                    );
                })}

                <div className="ml-auto flex items-center gap-2 pr-2">
                    <LeaveRequestDialog workspaceId={workspaceId}>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-[11px] font-bold uppercase tracking-wider border-border/60 hover:bg-muted/50 transition-all active:scale-95 cursor-pointer"
                        >
                            <Clock className="h-3.5 w-3.5" />
                            Apply Leave
                        </Button>
                    </LeaveRequestDialog>

                    {isAdmin && (
                        <InviteUserForm workspaceId={workspaceId} isAdmin={isAdmin}>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-[11px] font-bold uppercase tracking-wider border-border/60 hover:bg-muted/50 transition-all active:scale-95 cursor-pointer"
                            >
                                <Users className="h-3.5 w-3.5" />
                                Invite Member
                            </Button>
                        </InviteUserForm>
                    )}
                </div>
            </div>
        </div>
    );
}
