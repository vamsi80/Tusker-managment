"use client";

import { useState } from "react";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface AttendanceSettingsProps {
    workspaceId: string;
    initialData: {
        lateThreshold: string;
        overtimeThreshold: string;
    };
    isAdmin: boolean;
}

export function AttendanceSettings({ workspaceId, initialData, isAdmin }: AttendanceSettingsProps) {
    const [lateThreshold, setLateThreshold] = useState(initialData.lateThreshold);
    const [overtimeThreshold, setOvertimeThreshold] = useState(initialData.overtimeThreshold);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSave = async () => {
        if (!isAdmin) return;

        try {
            setIsLoading(true);
            const res = await fetch(`/api/v1/workspaces/${workspaceId}/attendance-settings`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lateThreshold, overtimeThreshold }),
            });

            const data = await res.json();
            if (data.success) {
                toast.success("Attendance settings updated successfully");
                router.refresh();
            } else {
                toast.error(data.error || "Failed to update settings");
            }
        } catch (error) {
            toast.error("An error occurred while saving settings");
        } finally {
            setIsLoading(false);
        }
    };

    const hasChanges = lateThreshold !== initialData.lateThreshold || overtimeThreshold !== initialData.overtimeThreshold;

    return (
        <div className="border-none overflow-hidden bg-background/50 backdrop-blur-sm">
            <div className="pb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                        <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-xl">Office hours</CardTitle>
                        <CardDescription>
                            Set the thresholds for late check-ins and overtime hours.
                        </CardDescription>
                    </div>
                </div>
            </div>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <Label htmlFor="lateThreshold" className="text-sm font-bold flex items-center gap-2">
                            Late Threshold
                            <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">(Indian Time)</span>
                        </Label>
                        <div className="relative group">
                            <Input
                                id="lateThreshold"
                                type="time"
                                value={lateThreshold}
                                onChange={(e) => setLateThreshold(e.target.value)}
                                disabled={!isAdmin || isLoading}
                                className="h-12 bg-background focus-visible:ring-primary/20 transition-all font-medium"
                            />
                            <div className="mt-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs text-amber-600 font-medium">
                                Check-ins after this time will be marked as <span className="font-bold">LATE</span>.
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="overtimeThreshold" className="text-sm font-bold flex items-center gap-2">
                            Overtime Threshold
                            <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">(Indian Time)</span>
                        </Label>
                        <div className="relative group">
                            <Input
                                id="overtimeThreshold"
                                type="time"
                                value={overtimeThreshold}
                                onChange={(e) => setOvertimeThreshold(e.target.value)}
                                disabled={!isAdmin || isLoading}
                                className="h-12 bg-background focus-visible:ring-primary/20 transition-all font-medium"
                            />
                            <div className="mt-2 p-3 rounded-lg bg-purple-500/5 border border-purple-500/10 text-xs text-purple-600 font-medium">
                                Check-outs after this time will be marked as <span className="font-bold">OT</span>.
                            </div>
                        </div>
                    </div>
                </div>

                {isAdmin && (
                    <div className="flex justify-end pt-4">
                        <Button
                            onClick={handleSave}
                            disabled={isLoading || !hasChanges}
                            className={cn(
                                "h-11 px-8 gap-2 shadow-lg transition-all active:scale-95",
                                hasChanges
                                    ? "bg-primary hover:bg-primary/90 shadow-primary/20"
                                    : "bg-muted text-muted-foreground shadow-none cursor-not-allowed opacity-50"
                            )}
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save Configuration
                        </Button>
                    </div>
                )}
            </CardContent>
        </div>
    );
}
