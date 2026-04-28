"use client";

import { ReactNode, Suspense } from "react";
import dynamic from "next/dynamic";
import { RealtimeNotificationListener } from "./realtime-notification-listener";

const GlobalSubTaskSheet = dynamic(() => import("@/components/global-subtask-sheet").then(mod => mod.GlobalSubTaskSheet), {
    ssr: false,
});

export function WorkspaceClientProviders({ children }: { children: ReactNode }) {
    return (
        <>
            {children}
            <Suspense fallback={null}>
                <RealtimeNotificationListener />
                <GlobalSubTaskSheet />
            </Suspense>
        </>
    );
}
