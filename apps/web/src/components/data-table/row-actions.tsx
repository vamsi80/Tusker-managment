"use client";

import * as React from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface DataTableCellAction<T> {
    label: string;
    onClick: (row: T) => void;
    icon?: React.ReactNode;
    variant?: "default" | "destructive";
    hidden?: (row: T) => boolean;
}

export function RowActions<T>({
    row,
    actions
}: {
    row: any;
    actions: DataTableCellAction<T>[];
}) {
    const mounted = useMounted();

    if (!mounted) {
        return (
            <div className="flex w-full justify-center">
                <Button variant="ghost" className="size-8 p-0" disabled>
                    <MoreVertical className="size-4 opacity-50" />
                </Button>
            </div>
        );
    }

    // Filter out hidden actions
    const visibleActions = actions.filter(action => !action.hidden?.(row.original));

    if (visibleActions.length === 0) return null;

    return (
        <div className="flex w-full justify-center">
            <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" className="size-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreVertical className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {visibleActions.map((action, index) => (
                        <DropdownMenuItem
                            key={index}
                            onClick={(e) => {
                                e.stopPropagation();
                                action.onClick(row.original);
                            }}
                            className={cn(
                                action.variant === "destructive" && "text-destructive focus:text-destructive"
                            )}
                        >
                            {action.icon && <span className="mr-2">{action.icon}</span>}
                            {action.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
