"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[AuthError]", error);
    }, [error]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
                An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
                <p className="text-xs text-muted-foreground">Error ID: {error.digest}</p>
            )}
            <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Try again
            </Button>
        </div>
    );
}
