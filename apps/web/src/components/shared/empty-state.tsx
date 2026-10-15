import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The design's empty state: an icon in a round bubble, a bold line and a muted one. */
export function EmptyState({
    icon: Icon,
    title,
    description,
    className,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col items-center justify-center gap-3 py-10 text-center", className)}>
            <div className="flex size-16 items-center justify-center rounded-full border bg-card shadow-sm">
                <Icon className="size-6" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
                <p className="font-semibold">{title}</p>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
        </div>
    );
}
