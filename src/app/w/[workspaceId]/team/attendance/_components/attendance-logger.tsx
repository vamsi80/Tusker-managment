"use client";

import { useState, useEffect } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, LogIn, LogOut, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { APP_DATE_FORMAT } from "@/lib/utils";

export function AttendanceLogger({ workspaceId }: { workspaceId: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"IDLE" | "CHECKED_IN" | "CHECKED_OUT">("IDLE");
    const [record, setRecord] = useState<any>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
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
                reject(new Error("Geolocation is not supported."));
                return;
            }

            // Use a simpler getCurrentPosition for speed
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                    });
                },
                (error) => {
                    let msg = "Failed to get location.";
                    if (error.code === error.PERMISSION_DENIED) msg = "Location permission denied.";
                    else if (error.code === error.TIMEOUT) msg = "Location request timed out.";
                    reject(new Error(msg));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0 // Force fresh location, no caching (harder to spoof)
                }
            );
        });
    };

    const [networkLocation, setNetworkLocation] = useState<{ city: string; region: string; country: string } | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [accuracy, setAccuracy] = useState<number | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    const handleAttendanceAction = async (action: "check-in" | "check-out") => {
        setIsLoading(true);
        setIsVerifying(true);
        setLocationError(null);
        setAddress(null);
        setNetworkLocation(null);

        try {
            // 1. Get GPS location (Optimized & Fresh)
            const result = await requestLocation();
            setLocation({ lat: result.lat, lng: result.lng });
            setAccuracy(result.accuracy);

            // 2. Parallel check: Get Network (IP-based) location to detect Fake GPS
            // This is harder to spoof than GPS as it's tied to the ISP
            const networkPromise = fetch('https://ipapi.co/json/')
                .then(res => res.json())
                .catch(() => null);

            // 3. Geocoding for the GPS coordinates
            const geocodePromise = fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${result.lat}&lon=${result.lng}&zoom=18&addressdetails=1`)
                .then(res => res.json())
                .catch(() => null);

            const [netData, geoData] = await Promise.all([
                networkPromise,
                Promise.race([
                    geocodePromise,
                    new Promise(resolve => setTimeout(() => resolve(null), 1500))
                ])
            ]) as any;

            setIsVerifying(false);

            if (netData?.city) {
                setNetworkLocation({
                    city: netData.city,
                    region: netData.region,
                    country: netData.country_name
                });

                // Simple check: If GPS says one city but IP says another (gross spoofing check)
                // Note: IP location can be inaccurate (e.g., nearby city), so we check for gross mismatch
                if (geoData?.address?.city && netData.city &&
                    geoData.address.city.toLowerCase() !== netData.city.toLowerCase() &&
                    !geoData.address.city.toLowerCase().includes(netData.city.toLowerCase())) {
                    console.warn("GPS/Network mismatch detected. Possible location spoofing.");
                }
            }

            let detectedAddress = "Location captured";
            if (geoData?.display_name) {
                detectedAddress = geoData.display_name;
                setAddress(detectedAddress);
            }

            const res = await fetch(`/api/v1/attendance/${action}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-workspace-id": workspaceId,
                },
                body: JSON.stringify({
                    latitude: result.lat,
                    longitude: result.lng,
                    address: detectedAddress,
                    networkLocation: netData ? `${netData.city}, ${netData.region}, ${netData.country_name}` : null,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                toast.error(data.error || `Failed to ${action.replace("-", " ")}`);
                setIsLoading(false);
                return;
            }

            toast.success(`Successfully ${action === "check-in" ? "checked in" : "checked out"}!`);
            setRecord(data.data);
            setStatus(action === "check-in" ? "CHECKED_IN" : "CHECKED_OUT");

        } catch (error: any) {
            console.error(`Attendance ${action} error:`, error);
            setLocationError(error.message);
            toast.error(error.message || `Failed to ${action}`);
        } finally {
            setIsLoading(false);
            setIsVerifying(false);
        }
    };

    return (
        <Card className="w-full max-w-md border-primary/20 shadow-lg shadow-primary/5">
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Daily Attendance
                </CardTitle>
                <CardDescription>
                    Mark your attendance for {mounted ? format(new Date(), APP_DATE_FORMAT) : "..."}.
                    <br />
                    <span className="text-primary font-medium mt-1 inline-block text-xs">
                        High-accuracy GPS required.
                    </span>
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {locationError && (
                    <div className="bg-destructive/10 text-destructive px-3 py-2 text-xs rounded-md flex items-start gap-2 border border-destructive/20">
                        <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <p>{locationError}</p>
                    </div>
                )}

                {isVerifying && (
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 flex items-center gap-2 animate-pulse">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Verifying actual location...</span>
                    </div>
                )}

                {(address || networkLocation) && (
                    <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 space-y-2">
                        {address && (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">GPS Location</span>
                                    {accuracy && (
                                        <span className="text-[10px] text-muted-foreground">
                                            Accuracy: {accuracy.toFixed(1)}m
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs font-medium leading-relaxed">{address}</p>
                            </div>
                        )}

                        {networkLocation && (
                            <div className="pt-2 border-t border-primary/10 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Network (ISP) Location</span>
                                </div>
                                <p className="text-[10px] font-medium text-muted-foreground">
                                    {networkLocation.city}, {networkLocation.region}, {networkLocation.country}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {status === "IDLE" && (
                    <Button
                        size="lg"
                        onClick={() => handleAttendanceAction("check-in")}
                        disabled={isLoading}
                        className="w-full gap-2"
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                        Check In
                    </Button>
                )}

                {status === "CHECKED_IN" && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 p-3 rounded-md border border-green-500/20">
                                <strong>Checked In:</strong> {mounted ? format(new Date(record.checkIn), "h:mm a") : "Loading..."}
                            </div>
                            {record.checkInAddress && (
                                <div className="text-[10px] text-muted-foreground px-1 leading-relaxed">
                                    <span className="font-bold">IN ADDRESS:</span> {record.checkInAddress}
                                </div>
                            )}
                        </div>
                        <Button
                            variant="destructive"
                            size="lg"
                            onClick={() => handleAttendanceAction("check-out")}
                            disabled={isLoading}
                            className="w-full gap-2"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                            Check Out
                        </Button>
                    </div>
                )}

                {status === "CHECKED_OUT" && (
                    <div className="space-y-4 text-sm">
                        <div className="space-y-3">
                            <div className="bg-muted p-3 rounded-md">
                                <strong>Checked In:</strong> {mounted ? format(new Date(record.checkIn), "h:mm a") : "..."}
                                {record.checkInAddress && (
                                    <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                                        <span className="font-bold">IN:</span> {record.checkInAddress}
                                    </div>
                                )}
                            </div>
                            <div className="bg-muted p-3 rounded-md">
                                <strong>Checked Out:</strong> {mounted ? format(new Date(record.checkOut), "h:mm a") : "..."}
                                {record.checkOutAddress && (
                                    <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                                        <span className="font-bold">OUT:</span> {record.checkOutAddress}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-center text-muted-foreground mt-4 italic">
                            Your attendance for today is completed.
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
