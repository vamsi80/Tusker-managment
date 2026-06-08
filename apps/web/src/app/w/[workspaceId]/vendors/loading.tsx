import { Skeleton } from "@/components/ui/skeleton";

export default function VendorsLoading() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-9 w-36" />
            </div>
            <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                ))}
            </div>
        </div>
    );
}
