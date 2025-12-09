"use client";

import { useState, useEffect, useTransition } from "react";
import { TaskTableSkeleton } from "../shared/task-page-skeleton";
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

            startTransition(() => {
                router.refresh();
                setIsReloading(false);
            });
        };

        window.addEventListener('taskTableReload', handleReload);

        return () => {
            window.removeEventListener('taskTableReload', handleReload);
        };
    }, [router]);

    if (isReloading || isPending) {
        return <TaskTableSkeleton />;
    }

    return <>{children}</>;
}
