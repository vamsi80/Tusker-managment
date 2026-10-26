import { useState } from "react";
import { StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, MapPin, X } from "lucide-react-native";
import { attendanceApi } from "../../api/people";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { fmtDate, fmtTime, toDateOnlyString } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Banner, Button, Input, Sheet, Text, tint } from "../ui";
import { tone } from "../../theme/tone";

type Fix = { lat: number; lng: number; accuracy: number };

/**
 * Mirrors team/attendance/_components/attendance-logger.tsx: watch GPS until the
 * fix is under 15 m (or 12 s pass), then check in / out. A refusal for being
 * outside every site radius asks for a reason and retries with it as the note.
 */
async function acquireLocation(onAccuracy: (m: number) => void): Promise<Fix> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") throw new Error("Location permission denied. Allow location access in Settings to mark attendance.");

    return new Promise((resolve, reject) => {
        let best: Location.LocationObject | null = null;
        let sub: Location.LocationSubscription | null = null;
        const finish = () => {
            sub?.remove();
            if (best) resolve({ lat: best.coords.latitude, lng: best.coords.longitude, accuracy: best.coords.accuracy ?? 999 });
            else reject(new Error("Failed to get a precise location signal. Make sure GPS is on and you have a clear signal."));
        };
        const timer = setTimeout(finish, 12_000);
        Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (position) => {
            const acc = position.coords.accuracy ?? 999;
            onAccuracy(acc);
            if (!best || acc < (best.coords.accuracy ?? 999)) best = position;
            if (acc <= 15) {
                clearTimeout(timer);
                finish();
            }
        })
            .then((s) => (sub = s))
            .catch((e) => {
                clearTimeout(timer);
                reject(e);
            });
    });
}

export function AttendanceLogger() {
    const { colors } = useTheme();
    const { workspaceId } = useWorkspace();
    const qc = useQueryClient();
    const [accuracy, setAccuracy] = useState<number | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [pending, setPending] = useState<"check-in" | "check-out" | null>(null);
    const [note, setNote] = useState("");

    const today = useQuery({
        queryKey: qk.attendanceToday(workspaceId),
        queryFn: () => attendanceApi.today(workspaceId, toDateOnlyString(new Date())),
        enabled: !!workspaceId,
    });
    const record = today.data;
    const status: "IDLE" | "CHECKED_IN" | "CHECKED_OUT" = record?.checkOut ? "CHECKED_OUT" : record?.checkIn ? "CHECKED_IN" : "IDLE";

    const act = useMutation({
        mutationFn: async ({ action, notes }: { action: "check-in" | "check-out"; notes?: string }) => {
            setLocationError(null);
            const fix = await acquireLocation(setAccuracy);
            const body = { latitude: fix.lat, longitude: fix.lng, accuracy: fix.accuracy, address: "Location captured", notes };
            const res = action === "check-in" ? await attendanceApi.checkIn(workspaceId, body) : await attendanceApi.checkOut(workspaceId, body);
            return { action, data: res.data };
        },
        onSuccess: ({ action, data }) => {
            toast.success(`Successfully ${action === "check-in" ? "checked in" : "checked out"}!`);
            qc.setQueryData(qk.attendanceToday(workspaceId), data);
            qc.invalidateQueries({ queryKey: ["attendance", workspaceId] });
            qc.invalidateQueries({ queryKey: ["register", workspaceId] });
            setPending(null);
            setNote("");
        },
        onError: (error: any, vars) => {
            const message = String(error?.message ?? "");
            if (message.includes("radius") || message.includes("required location")) {
                setPending(vars.action);
                return;
            }
            setLocationError(message || "Failed to mark attendance");
            toast.fromError(error);
        },
    });

    const signal =
        accuracy == null
            ? { label: "GPS Waiting", color: colors.mutedForeground }
            : accuracy <= 20
              ? { label: `Strong GPS Signal (${Math.round(accuracy)}m)`, color: tone("success") }
              : accuracy <= 60
                ? { label: `Moderate GPS Signal (${Math.round(accuracy)}m)`, color: tone("warning") }
                : { label: `Weak GPS Signal (${Math.round(accuracy)}m) — move near a window`, color: tone("danger") };

    const busyLabel = `Acquiring GPS…${accuracy ? ` (${Math.round(accuracy)}m)` : ""}`;

    return (
        <View style={{ gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.iconWrap, { backgroundColor: tint(colors.primary, 0.14) }]}>
                    <MapPin size={20} color={colors.primaryInk} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text variant="h3">Daily Attendance</Text>
                    <Text variant="caption" tone="muted">
                        {fmtDate(new Date(), "EEEE, dd MMM yyyy")}
                    </Text>
                </View>
            </View>
            <View style={[styles.signal, { backgroundColor: tint(signal.color.startsWith("#") ? signal.color : "#999999", 0.1), borderColor: tint(signal.color.startsWith("#") ? signal.color : "#999999", 0.25) }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: signal.color }} />
                <Text variant="overline" color={signal.color}>
                    {signal.label}
                </Text>
            </View>

            {locationError ? (
                <Banner tone="destructive">
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <X size={14} color={colors.destructive} />
                        <Text variant="small" tone="destructive" style={{ flex: 1 }}>
                            {locationError}
                        </Text>
                    </View>
                </Banner>
            ) : null}

            {status === "IDLE" ? (
                <Button
                    size="lg"
                    icon={LogIn}
                    title={act.isPending ? busyLabel : "Check In"}
                    loading={act.isPending && !accuracy}
                    disabled={act.isPending || today.isLoading}
                    onPress={() => act.mutate({ action: "check-in" })}
                />
            ) : null}

            {status === "CHECKED_IN" ? (
                <View style={{ gap: 14 }}>
                    <View style={[styles.stamp, { borderColor: tint(tone("success"), 0.3), backgroundColor: tint(tone("success"), 0.08) }]}>
                        <Text variant="overline" tone="muted">
                            Checked in
                        </Text>
                        <Text variant="h1" style={{ fontVariant: ["tabular-nums"] }}>
                            {fmtTime(record?.checkIn)}
                        </Text>
                        {record?.checkInAddress ? (
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                                At: {record.checkInAddress}
                            </Text>
                        ) : null}
                    </View>
                    <Button
                        size="lg"
                        variant="destructive"
                        icon={LogOut}
                        title={act.isPending ? busyLabel : "Check Out"}
                        disabled={act.isPending}
                        onPress={() => act.mutate({ action: "check-out" })}
                    />
                </View>
            ) : null}

            {status === "CHECKED_OUT" ? (
                <View style={[styles.stamp, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Text variant="overline" tone="muted">
                        Session Log
                    </Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                        <View>
                            <Text variant="caption" tone="muted">
                                IN
                            </Text>
                            <Text variant="title">{fmtTime(record?.checkIn)}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                            <Text variant="caption" tone="muted">
                                OUT
                            </Text>
                            <Text variant="title" tone="primary">
                                {fmtTime(record?.checkOut)}
                            </Text>
                        </View>
                    </View>
                    <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
                        You're done for today.
                    </Text>
                </View>
            ) : null}

            <Sheet
                open={!!pending}
                onClose={() => setPending(null)}
                title="Outside an attendance location"
                description="You're not within any office or site radius. Add a reason to continue."
                footer={
                    <>
                        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setPending(null)} />
                        <Button
                            title="Submit"
                            style={{ flex: 1 }}
                            loading={act.isPending}
                            onPress={() => {
                                if (!note.trim()) return toast.error("Please provide a reason.");
                                if (pending) act.mutate({ action: pending, notes: note.trim() });
                            }}
                        />
                    </>
                }
            >
                <Input label="Reason" multiline placeholder="e.g. Working from the client site today" value={note} onChangeText={setNote} />
            </Sheet>
        </View>
    );
}

const styles = StyleSheet.create({
    iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    signal: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    stamp: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 4 },
});
