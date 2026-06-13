"use client";

import { useState, useEffect } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, LogIn, LogOut, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { APP_DATE_FORMAT } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type AttendanceTodayRecord = {
    checkIn?: string | Date | null;
    checkOut?: string | Date | null;
    checkInAddress?: string | null;
    checkOutAddress?: string | null;
    [key: string]: unknown;
};

export function AttendanceLogger({ workspaceId }: { workspaceId: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"IDLE" | "CHECKED_IN" | "CHECKED_OUT">("IDLE");
    const [record, setRecord] = useState<AttendanceTodayRecord | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [showNoteDialog, setShowNoteDialog] = useState(false);
    const [note, setNote] = useState("");
    const [pendingAction, setPendingAction] = useState<"check-in" | "check-out" | null>(null);
    const mounted = useMounted();

    // Fetch today's initial status on mount
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch(`/api/v1/attendance/today`, {
                    headers: { "x-workspace-id": workspaceId }
                });

                const data = await res.json();

                if (data.success && data.data) {
                    setRecord(data.data);
                    if (data.data.checkOut) {
                        setStatus("CHECKED_OUT");
                    } else if (data.data.checkIn) {
                        setStatus("CHECKED_IN");
                    }
                }
            } catch (error) {
                console.error("Failed to fetch attendance status", error);
            }
        };

        fetchStatus();
    }, [workspaceId]);

    const requestLocation = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation is not supported by your browser."));
                return;
            }

            let bestPosition: GeolocationPosition | null = null;
            let watchId: number | null = null;
            const startTime = Date.now();
            const timeoutDuration = 12000; // Wait up to 12 seconds to stabilize accuracy

            const cleanUp = () => {
                if (watchId !== null) {
                    navigator.geolocation.clearWatch(watchId);
                }
            };

            const checkFinished = () => {
                if (bestPosition) {
                    cleanUp();
                    resolve({
                        lat: bestPosition.coords.latitude,
                        lng: bestPosition.coords.longitude,
                        accuracy: bestPosition.coords.accuracy,
                    });
                } else {
                    cleanUp();
                    reject(new Error("Failed to get a precise location signal. Please ensure GPS is enabled and you are in a location with clear signal."));
                }
            };

            // Use watchPosition to warm up the GPS sensor and acquire more satellites, which dramatically improves accuracy indoors over a few seconds!
            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    setAccuracy(position.coords.accuracy);
                    setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });

                    // Keep the position with the best (lowest number) accuracy
                    if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
                        bestPosition = position;
                    }

                    // If we have achieved a very high accuracy signal (15 meters or better), resolve immediately!
                    if (position.coords.accuracy <= 15) {
                        cleanUp();
                        resolve({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                        });
                    }
                },
                (error) => {
                    // Do not reject immediately on intermediate errors, just log them unless it's a permission failure
                    if (error.code === error.PERMISSION_DENIED) {
                        cleanUp();
                        reject(new Error("Location permission denied. Please allow location access in your browser settings."));
                    }
                },
                {
                    enableHighAccuracy: true,
                    timeout: timeoutDuration,
                    maximumAge: 0,
                }
            );

            // Timeout fallback to return the best position we got so far
            setTimeout(() => {
                checkFinished();
            }, timeoutDuration);
        });
    };

    const [accuracy, setAccuracy] = useState<number | null>(null);

    const handleAttendanceAction = async (action: "check-in" | "check-out", providedNote?: string) => {
        setIsLoading(true);
        setLocationError(null);

        try {
            // 1. Get GPS location (Optimized & Fresh)
            const result = await requestLocation();
            setLocation({ lat: result.lat, lng: result.lng });
            setAccuracy(result.accuracy);

            const res = await fetch(`/api/v1/attendance/${action}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-workspace-id": workspaceId,
                },
                body: JSON.stringify({
                    latitude: result.lat,
                    longitude: result.lng,
                    accuracy: result.accuracy,
                    address: "Location captured",
                    city: null,
                    networkLocation: null,
                    notes: providedNote,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                // If the error is due to location, prompt for a note
                if (data.error?.includes("radius") || data.error?.includes("required location")) {
                    setPendingAction(action);
                    setShowNoteDialog(true);
                    setIsLoading(false);
                    return;
                }
                toast.error(data.error || `Failed to ${action.replace("-", " ")}`);
                setIsLoading(false);
                return;
            }

            toast.success(`Successfully ${action === "check-in" ? "checked in" : "checked out"}!`);
            setRecord(data.data);
            setStatus(action === "check-in" ? "CHECKED_IN" : "CHECKED_OUT");
            setShowNoteDialog(false);
            setNote("");

            // 🚀 INSTANT UI UPDATE: Notify listeners immediately
            window.dispatchEvent(new CustomEvent("realtime-attendance-sync", {
                detail: {
                    action: action === "check-in" ? "CHECKED_IN" : "CHECKED_OUT",
                    record: data.data,
                    isActor: true
                }
            }));

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : `Failed to ${action}`;
            console.error(`Attendance ${action} error:`, error);
            setLocationError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const submitWithNote = async () => {
        if (!note.trim()) {
            toast.error("Please provide a reason.");
            return;
        }
        if (pendingAction) {
            await handleAttendanceAction(pendingAction, note);
        }
    };

    return (
        <div className="w-full overflow-hidden bg-card border rounded-2xl shadow-xl transition-all duration-300">
            {/* Header with gradient subtle background */}
            <div className="relative px-6 pt-6 pb-4 bg-gradient-to-b from-primary/5 to-transparent border-b border-primary/10">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 bg-primary/10 rounded-xl">
                        <MapPin className="size-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold tracking-tight">Daily Attendance</h3>
                        <p className="text-[11px] text-muted-foreground font-medium">
                            {mounted ? format(new Date(), APP_DATE_FORMAT) : "..."}
                        </p>
                    </div>
                </div>
                <div className="mt-3">
                    {!accuracy ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted border border-border rounded-full w-fit">
                            <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">GPS Waiting</span>
                        </div>
                    ) : accuracy <= 20 ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full w-fit">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Strong GPS Signal ({Math.round(accuracy)}m)</span>
                        </div>
                    ) : accuracy <= 60 ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full w-fit">
                            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Moderate GPS Signal ({Math.round(accuracy)}m)</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full w-fit">
                            <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Weak GPS Signal ({Math.round(accuracy)}m) — Move near a window</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-6 flex flex-col gap-5">
                {locationError && (
                    <div className="bg-destructive/5 text-destructive px-4 py-3 text-xs rounded-xl flex items-start gap-3 border border-destructive/20 animate-in fade-in slide-in-from-top-1">
                        <div className="p-1 bg-destructive/10 rounded-full mt-0.5">
                            <X className="size-3 shrink-0" />
                        </div>
                        <p className="font-medium leading-relaxed">{locationError}</p>
                    </div>
                )}


                <div className="space-y-4">
                    {status === "IDLE" && (
                        <Button
                            size="lg"
                            onClick={() => handleAttendanceAction("check-in")}
                            disabled={isLoading}
                            className="w-full h-12 gap-3 text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all rounded-xl"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="size-5 animate-spin" />
                                    Acquiring GPS... {accuracy ? `(${Math.round(accuracy)}m)` : ""}
                                </>
                            ) : (
                                <>
                                    <LogIn className="size-5" />
                                    Check In
                                </>
                            )}
                        </Button>
                    )}

                    {status === "CHECKED_IN" && (
                        <div className="space-y-5 animate-in zoom-in-95 duration-300">
                            <div className="bg-green-500/5 border border-green-500/20 p-4 rounded-xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-1 opacity-10">
                                    <LogIn className="size-16" />
                                </div>
                                <div className="relative z-10">
                                    <p className="text-2xl font-black text-foreground tabular-nums tracking-tight">
                                        {mounted && record?.checkIn ? format(new Date(record.checkIn), "h:mm a") : "Loading..."}
                                    </p>
                                    {record?.checkInAddress && (
                                        <p className="text-[10px] text-muted-foreground mt-3 font-medium leading-relaxed italic truncate opacity-80 hover:opacity-100 transition-opacity">
                                            At: {record.checkInAddress}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <Button
                                variant="destructive"
                                size="lg"
                                onClick={() => handleAttendanceAction("check-out")}
                                disabled={isLoading}
                                className="w-full h-12 gap-3 text-base font-bold shadow-lg shadow-destructive/20 hover:shadow-destructive/30 transition-all rounded-xl border-b-4 border-destructive/50 active:border-b-0 active:translate-y-1"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="size-5 animate-spin" />
                                        Acquiring GPS... {accuracy ? `(${Math.round(accuracy)}m)` : ""}
                                    </>
                                ) : (
                                    <>
                                        <LogOut className="size-5" />
                                        Check Out
                                    </>
                                )}
                            </Button>
                        </div>
                    )}

                    {status === "CHECKED_OUT" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="grid grid-cols-1 gap-3">
                                <div className="bg-muted/30 p-4 rounded-xl border border-border/50 relative overflow-hidden group">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Session Log</span>
                                        <div className="flex items-center justify-between mt-1">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">In</span>
                                                <span className="text-sm font-bold tabular-nums">
                                                    {mounted && record?.checkIn ? format(new Date(record.checkIn), "h:mm a") : "..."}
                                                </span>
                                            </div>
                                            <div className="h-8 w-px bg-border/50" />
                                            <div className="flex flex-col items-end">
                                                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">Out</span>
                                                <span className="text-sm font-bold tabular-nums text-primary">
                                                    {mounted && record?.checkOut ? format(new Date(record.checkOut), "h:mm a") : "..."}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {record?.checkOutAddress && (
                                        <p className="text-[9px] text-muted-foreground/60 mt-3 font-medium truncate italic border-t pt-2 border-border/30">
                                            Last Loc: {record.checkOutAddress}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-primary/5 border border-primary/10 text-center">
                                <div className="p-2 bg-primary/10 rounded-full mb-2">
                                    <MapPin className="size-4 text-primary" />
                                </div>
                                <p className="text-xs font-bold text-primary uppercase tracking-tighter">Day Completed</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-1">Rest well! See you tomorrow.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <MapPin className="size-5 text-destructive" />
                            Outside Work Location
                        </DialogTitle>
                        <DialogDescription className="text-xs font-medium mt-2">
                            You are currently outside the authorized work radius. Please provide a reason for marking attendance from this location.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            placeholder="Reason for off-site attendance (e.g., Client meeting, On-site visit, Home office...)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="min-h-[100px] rounded-xl bg-muted/30 border-primary/10 focus:border-primary/30 transition-all resize-none"
                        />
                    </div>
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                setShowNoteDialog(false);
                                setNote("");
                            }}
                            className="rounded-xl"
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={submitWithNote}
                            disabled={isLoading || !note.trim()}
                            className="gap-2 rounded-xl"
                        >
                            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                            Submit Attendance
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
