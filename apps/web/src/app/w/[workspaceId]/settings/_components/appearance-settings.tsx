"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAppearanceStore } from "@/lib/store/appearance-store";

/** Personal look-and-feel options; saved in this browser only. */
export function AppearanceSettings() {
    const flowingLight = useAppearanceStore((s) => s.flowingLight);
    const setFlowingLight = useAppearanceStore((s) => s.setFlowingLight);
    const load = useAppearanceStore((s) => s.load);
    useEffect(load, [load]);

    return (
        <div className="space-y-3">
            <div>
                <h2 className="text-base font-semibold">Appearance</h2>
                <p className="text-sm text-muted-foreground">Just for you, on this device.</p>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-xs dark:bg-card">
                <span className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 size-5 text-primary-ink" />
                    <span>
                        <span className="block text-sm font-medium">Flowing light</span>
                        <span className="block text-sm text-muted-foreground">
                            A soft light that travels along the background curves.
                        </span>
                    </span>
                </span>
                <Switch checked={flowingLight} onCheckedChange={setFlowingLight} aria-label="Flowing light" />
            </label>
        </div>
    );
}
