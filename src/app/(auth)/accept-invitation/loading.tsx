import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AcceptInvitationLoading() {
    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-muted/30">
            <Card className="w-full max-w-md mx-auto border-t-4 border-t-primary shadow-xl">
                <CardHeader>
                    {/* Welcome! Title Skeleton */}
                    <Skeleton className="h-8 w-32 mb-2" />
                    {/* Description Skeleton */}
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4 mt-1" />
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Email Field Skeleton */}
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    {/* Full Name Field Skeleton */}
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    {/* Password Field Skeleton */}
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    {/* Confirm Password Field Skeleton */}
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    {/* Button Skeleton */}
                    <Skeleton className="h-10 w-full mt-4" />
                </CardContent>
                <CardFooter className="flex justify-center flex-col gap-2">
                    <Skeleton className="h-3 w-4/5 mx-auto" />
                    <Skeleton className="h-3 w-3/5 mx-auto" />
                </CardFooter>
            </Card>
        </div>
    );
}
