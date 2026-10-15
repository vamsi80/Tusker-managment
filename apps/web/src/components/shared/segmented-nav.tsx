"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSafeNavigation } from "@/hooks/use-safe-navigation";

export interface SegmentedNavItem {
    label: string;
    href: string;
    icon?: LucideIcon;
    active: boolean;
}

/**
 * The pill tab bar used for page sub-navigation (Team, Settings, Tasks views...):
 * a muted track with the active route as a solid amber pill.
 */
export function SegmentedNav({ items, className }: { items: SegmentedNavItem[]; className?: string }) {
    const router = useSafeNavigation();

    return (
        <nav
            className={cn(
                "inline-flex max-w-full items-center gap-1 overflow-x-auto scrollbar-hide rounded-full border border-white/70 bg-muted p-1 shadow-xs dark:border-border",
                router.isNavigating && "opacity-60 pointer-events-none transition-opacity",
                className
            )}
        >
            {items.map(({ label, href, icon: Icon, active }) => (
                <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    onClick={(e) => {
                        e.preventDefault();
                        if (!active) router.push(href);
                    }}
                    className={cn(
                        "flex h-9 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm whitespace-nowrap transition-colors sm:min-w-32",
                        active
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    {Icon && <Icon className="size-4" />}
                    {label}
                </Link>
            ))}
        </nav>
    );
}
