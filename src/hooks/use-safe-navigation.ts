"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

/**
 * useSafeNavigation
 * 
 * A hook that provides a guarded router object. It ensures that 
 * navigation requests are ignored if another one is already in progress,
 * and integrates with the global isNavigating state for visual feedback.
 */
export function useSafeNavigation() {
  const router = useRouter();
  const { isNavigating, startNavigation } = useWorkspaceLayout();

  const safePush = useCallback((href: string, options?: any) => {
    if (isNavigating) return;
    
    startNavigation(() => {
        router.push(href, options);
    });
  }, [router, isNavigating, startNavigation]);

  const safeReplace = useCallback((href: string, options?: any) => {
    if (isNavigating) return;

    startNavigation(() => {
        router.replace(href, options);
    });
  }, [router, isNavigating, startNavigation]);

  return {
    ...router,
    push: safePush,
    replace: safeReplace,
    isNavigating
  };
}
