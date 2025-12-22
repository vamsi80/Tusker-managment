"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { revalidateTaskData } from "@/data/task/revalidate-task-data";

interface ReloadButtonProps {
    projectId: string;
    userId: string;
}

export function ReloadButton({ projectId, userId }: ReloadButtonProps) {
    const [isReloading, setIsReloading] = useState(false);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Detect current view from URL
    const currentView = (searchParams.get('view') || 'list') as 'list' | 'kanban' | 'gantt';

    const handleReload = async () => {
        setIsReloading(true);

        const toastId = toast.loading(`Refreshing ${currentView} view...`);

        try {
            // Use server action to revalidate cache tags (much faster than router.refresh)
            const result = await revalidateTaskData(projectId, userId, currentView);

            if (result.success) {
                // Trigger a router refresh to re-render with new data
                startTransition(() => {
                    router.refresh();
                });

                toast.success(`${currentView.charAt(0).toUpperCase() + currentView.slice(1)} view refreshed!`, {
                    id: toastId,
                    duration: 2000
                });
            } else {
                toast.error("Failed to refresh data", { id: toastId });
            }
        } catch (error) {
            console.error("Error reloading:", error);
            toast.error("Failed to refresh data", { id: toastId });
        } finally {
            // Keep button disabled during transition
            setTimeout(() => {
                setIsReloading(false);
            }, 500);
        }
    };

    const isLoading = isReloading || isPending;

    return (
        <Button
            onClick={handleReload}
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="gap-2"
            title={`Refresh ${currentView} view`}
        >
            <RefreshCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
        </Button>
    );
}
