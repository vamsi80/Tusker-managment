"use client";

import { MessageSquare, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubtaskSheetNavBarProps {
    activeTab: "messages" | "review";
    onTabChange: (tab: "messages" | "review") => void;
    messagesCount: number;
    reviewCount: number;
}

/**
 * Subtask Sheet Navigation Bar
 * 
 * Styled like ProjectNav with bottom border indicators
 * Tab navigation for switching between:
 * - Messages (comments)
 * - Review (review comments)
 */
export function SubtaskSheetNavBar({
    activeTab,
    onTabChange,
    messagesCount,
    reviewCount
}: SubtaskSheetNavBarProps) {
    const tabs = [
        {
            name: "Messages",
            value: "messages" as const,
            icon: MessageSquare,
            count: messagesCount,
        },
        {
            name: "Review",
            value: "review" as const,
            icon: FileCheck,
            count: reviewCount,
        },
    ];

    return (
        <div className="border-b">
            <div className="flex h-10 items-center gap-2 sm:gap-4 px-4 sm:px-6 overflow-x-auto scrollbar-hide">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.value;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.value}
                            onClick={() => onTabChange(tab.value)}
                            className={cn(
                                "flex h-full items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors hover:text-primary whitespace-nowrap flex-shrink-0",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            <span>{tab.name}</span>
                            <span className={cn(
                                "ml-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                                isActive
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                            )}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
