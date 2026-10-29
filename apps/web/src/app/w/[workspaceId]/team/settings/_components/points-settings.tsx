"use client";

import { useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { apiClient } from "@tusker/api-client";
import type { PointsResetPeriod } from "@tusker/core/lib/date-utils";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS: { value: PointsResetPeriod; label: string }[] = [
    { value: "WEEKLY", label: "Every week (Monday)" },
    { value: "MONTHLY", label: "Every month" },
    { value: "QUARTERLY", label: "Every quarter (Jan, Apr, Jul, Oct)" },
    { value: "YEARLY", label: "Every year (1 January)" },
    { value: "NEVER", label: "Never — keep a running total" },
];

export function PointsSettings({ workspaceId, initialPeriod }: { workspaceId: string; initialPeriod: PointsResetPeriod }) {
    const [period, setPeriod] = useState<PointsResetPeriod>(initialPeriod);
    const [saved, setSaved] = useState<PointsResetPeriod>(initialPeriod);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            await apiClient.points.setResetPeriod(workspaceId, period);
            setSaved(period);
            toast.success("Points settings saved");
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex max-w-xl flex-col gap-5 rounded-2xl bg-white/60 p-5 dark:bg-card/60">
            <div className="flex items-start gap-3">
                <Trophy className="mt-0.5 size-5 text-primary-ink" />
                <div>
                    <h2 className="font-heading font-bold">Reward points</h2>
                    <p className="text-sm text-muted-foreground">
                        Finishing a task early earns its assignee 1 point per working day early; finishing late
                        costs 1 per working day late. Sundays and public holidays don&apos;t count. Owners, admins
                        and managers can also award or deduct points with a reason.
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="points-reset">Totals restart</Label>
                <Select value={period} onValueChange={(v) => setPeriod(v as PointsResetPeriod)}>
                    <SelectTrigger id="points-reset" className="w-full sm:w-80">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    Nothing is deleted when totals restart — every past award stays in the history.
                </p>
            </div>

            <div>
                <Button onClick={save} disabled={saving || period === saved}>
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    Save
                </Button>
            </div>
        </div>
    );
}
