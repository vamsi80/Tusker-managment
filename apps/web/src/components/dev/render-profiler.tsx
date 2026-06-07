// PERF_TEMP: delete this file before shipping to production
"use client";

import { Profiler } from "react";

function onRender(
    id: string,
    phase: string,
    actualDuration: number,
) {
    if (actualDuration > 50) {
        console.warn(`[RENDER_SLOW] ${id} ${phase} ${actualDuration.toFixed(1)}ms`);
    } else if (process.env.NODE_ENV === "development") {
        console.log(`[RENDER_TIMING] ${id} ${phase} ${actualDuration.toFixed(1)}ms`);
    }
}

export function RenderProfiler({
    id,
    children,
}: {
    id: string;
    children: React.ReactNode;
}) {
    return (
        <Profiler id={id} onRender={onRender}>
            {children}
        </Profiler>
    );
}
