"use client";

import { useState, useEffect, useTransition } from "react";
import { TaskTableSkeleton } from "./task-page-skeleton";
import { useRouter } from "next/navigation";

interface ReloadableTaskTableProps {
    children: React.ReactNode;
}

export function ReloadableTaskTable({ children }: ReloadableTaskTableProps) {
    const [isReloading, setIsReloading] = useState(false);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    useEffect(() => {
        const handleReload = () => {
            setIsReloading(true);

            // Use startTransition to track actual loading state
            startTransition(() => {
                router.refresh();
                // This will automatically complete when refresh is done
                setIsReloading(false);
            });
        };

        window.addEventListener('taskTableReload', handleReload);

        return () => {
            window.removeEventListener('taskTableReload', handleReload);
        };
    }, [router]);

    // Show skeleton while reloading OR while transition is pending
    if (isReloading || isPending) {
        return <TaskTableSkeleton />;
    }

    return <>{children}</>;
}
