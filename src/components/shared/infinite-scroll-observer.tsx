"use client";

import React, { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

interface InfiniteScrollObserverProps {
    onIntersect: () => void;
    isLoading: boolean;
    hasMore: boolean;
    className?: string;
    rootMargin?: string;
    threshold?: number;
}

/**
 * A lightweight observer component that triggers a callback when it enters the viewport.
 * Used to automate paginated loading (infinite scroll).
 */
export function InfiniteScrollObserver({
    onIntersect,
    isLoading,
    hasMore,
    className = "py-4 flex items-center justify-center w-full",
    rootMargin = "200px",
    threshold = 0.1,
}: InfiniteScrollObserverProps) {
    const observerTarget = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!hasMore || isLoading) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    onIntersect();
                }
            },
            {
                rootMargin,
                threshold,
            }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [onIntersect, isLoading, hasMore, rootMargin, threshold]);

    if (!hasMore) return null;

    return (
        <div ref={observerTarget} className={className}>
            {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading more...</span>
                </div>
            )}
        </div>
    );
}
