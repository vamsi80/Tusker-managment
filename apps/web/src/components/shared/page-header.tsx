import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page title block from the design: a large bold title, an optional subtitle,
 * then a row holding the sub-navigation on the left and actions on the right.
 */
export function PageHeader({
    title,
    description,
    nav,
    actions,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    nav?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-4", className)}>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
                    {description && <p className="mt-1 text-sm text-foreground/80">{description}</p>}
                </div>
                {!nav && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {nav && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {nav}
                    {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
                </div>
            )}
        </div>
    );
}
