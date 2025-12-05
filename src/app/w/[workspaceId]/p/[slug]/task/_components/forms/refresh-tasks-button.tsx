"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Button to refresh task and subtask data
 * - Shows loading state during refresh
 * - Uses router.refresh() to fetch latest data from server
 * - Provides visual feedback with toast notification
 */
export function RefreshTasksButton() {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleRefresh = () => {
        toast.success("Refreshing tasks...");
        startTransition(() => {
            router.refresh();
        });
    };

    return (
        <Button
            variant="outline"
            size="default"
            onClick={handleRefresh}
            disabled={isPending}
            className="gap-2"
        >
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
        </Button>
    );
}
