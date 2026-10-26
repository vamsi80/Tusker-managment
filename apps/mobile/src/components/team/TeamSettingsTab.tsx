import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { CalendarDays, Clock, Crosshair, MapPin, Plus, Search, ShieldAlert, Trash2, Trophy } from "lucide-react-native";
import { adminApi } from "../../api/admin";
import { attendanceApi } from "../../api/people";
import { workspacesApi } from "../../api/workspaces";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Button, Card, CardHeader, DateField, EmptyState, ErrorState, Input, ListSkeleton, Select, Text } from "../ui";
import { ScreenBody } from "../layout/Screen";

const toTime = (hhmm?: string | null) => {
    const d = new Date();
    const [h, m] = (hhmm ?? "09:00").split(":").map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
};
const fromTime = (d: Date | null) => (d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "00:00");

type Loc = { name: string; address: string | null; latitude: string; longitude: string; radius: string };

const RESET_PERIODS = [
    { value: "WEEKLY", label: "Every week (Monday)" },
    { value: "MONTHLY", label: "Every month" },
    { value: "QUARTERLY", label: "Every quarter (Jan, Apr, Jul, Oct)" },
    { value: "YEARLY", label: "Every year (1 January)" },
    { value: "NEVER", label: "Never — keep a running total" },
];

/** team/settings — attendance-settings.tsx, shift-timings.tsx and points-settings.tsx. Admins only. */
export function TeamSettingsTab() {
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, isAdmin } = useWorkspace();
    const settings = useQuery({ queryKey: qk.attendanceSettings(workspaceId), queryFn: () => adminApi.attendanceSettings(workspaceId), enabled: !!workspaceId && isAdmin });
    const schedules = useQuery({ queryKey: qk.shiftSchedules(workspaceId), queryFn: () => adminApi.shiftSchedules(workspaceId), enabled: !!workspaceId && isAdmin });

    const [sickLimit, setSickLimit] = useState("12");
    const [accrual, setAccrual] = useState("20");
    const [holidays, setHolidays] = useState<{ name: string; date: Date | null }[]>([]);
    const [locations, setLocations] = useState<Loc[]>([]);
    const [period, setPeriod] = useState<string>("MONTHLY");

    useEffect(() => {
        const s = settings.data;
        if (!s) return;
        setSickLimit(String(s.sickLeaveLimit ?? 12));
        setAccrual(String(s.casualLeaveAccrualDays ?? 20));
        setHolidays((s.publicHolidays ?? []).map((h: any) => ({ name: h.name, date: new Date(h.date) })));
        setLocations((s.attendanceLocations ?? []).map((l: any) => ({ name: l.name, address: l.address, latitude: String(l.latitude), longitude: String(l.longitude), radius: String(l.radius ?? 100) })));
        setPeriod(s.pointsResetPeriod ?? "MONTHLY");
    }, [settings.data]);

    const save = useMutation({
        mutationFn: () => {
            const s = settings.data;
            for (const l of locations) {
                if (!l.name.trim()) throw new Error("Every location needs a name");
                if (!Number.isFinite(parseFloat(l.latitude)) || !Number.isFinite(parseFloat(l.longitude))) throw new Error(`Set coordinates for ${l.name || "each location"}`);
            }
            return attendanceApi.updateSettings(workspaceId, {
                lateThreshold: s.lateThreshold,
                overtimeThreshold: s.overtimeThreshold,
                halfDayThreshold: s.halfDayThreshold,
                shiftStartTime: s.shiftStartTime,
                shiftEndTime: s.shiftEndTime,
                sickLeaveLimit: Number(sickLimit) || 0,
                casualLeaveAccrualDays: Number(accrual) || 0,
                publicHolidays: holidays.filter((h) => h.name.trim() && h.date).map((h) => ({ name: h.name.trim(), date: h.date!.toISOString() })),
                attendanceLocations: locations.map((l) => ({ name: l.name.trim(), address: l.address, latitude: parseFloat(l.latitude), longitude: parseFloat(l.longitude), radius: parseFloat(l.radius || "100") })),
            });
        },
        onSuccess: () => {
            toast.success("Attendance settings updated successfully");
            qc.invalidateQueries({ queryKey: qk.attendanceSettings(workspaceId) });
        },
        onError: (e) => toast.fromError(e, "Failed to update settings"),
    });

    const savePeriod = useMutation({
        mutationFn: (p: string) => workspacesApi.updateSettings(workspaceId, { pointsResetPeriod: p }),
        onSuccess: () => {
            toast.success("Points reset period saved");
            qc.invalidateQueries({ queryKey: qk.points(workspaceId) });
        },
        onError: (e) => toast.fromError(e),
    });

    if (!isAdmin) {
        return (
            <EmptyState icon={ShieldAlert} title="Access Denied" description="This area is restricted to Workspace Owners and Admins only." />
        );
    }
    if (settings.isLoading) {
        return (
            <View style={{ padding: 16 }}>
                <ListSkeleton rows={5} avatar={false} />
            </View>
        );
    }
    // Without the saved settings the form would show blanks and overwrite them on save.
    if (settings.isError) return <ErrorState message={(settings.error as Error).message} onRetry={() => settings.refetch()} />;

    const setLoc = (i: number, patch: Partial<Loc>) => setLocations((c) => c.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

    const useCurrent = async (i: number) => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") throw new Error("Location permission denied");
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
            setLoc(i, {
                latitude: pos.coords.latitude.toFixed(6),
                longitude: pos.coords.longitude.toFixed(6),
                address: place ? [place.name, place.street, place.district, place.city, place.region, place.postalCode].filter(Boolean).join(", ") : locations[i].address,
            });
        } catch (e) {
            toast.fromError(e);
        }
    };
    const searchAddress = async (i: number) => {
        try {
            const query = locations[i].address?.trim();
            if (!query) throw new Error("Type an address to search");
            const [hit] = await Location.geocodeAsync(query);
            if (!hit) throw new Error("No match for that address");
            setLoc(i, { latitude: hit.latitude.toFixed(6), longitude: hit.longitude.toFixed(6) });
        } catch (e) {
            toast.fromError(e);
        }
    };

    return (
        <ScreenBody refreshing={settings.isRefetching} onRefresh={() => { settings.refetch(); schedules.refetch(); }}>
            <Card padded={false}>
                <CardHeader title="Shift Timings" icon={Clock} description="Per shift schedule; departments point at one." />
                <View style={{ padding: 16, gap: 16 }}>
                    {(schedules.data ?? []).length === 0 ? (
                        <Text variant="small" tone="muted">
                            No shift schedules yet.
                        </Text>
                    ) : (
                        (schedules.data ?? []).map((s: any) => <ScheduleEditor key={s.id} schedule={s} />)
                    )}
                </View>
            </Card>

            <Card padded={false}>
                <CardHeader title="Leave Rules" icon={CalendarDays} />
                <View style={{ padding: 16, gap: 12 }}>
                    <Input label="Yearly Sick Leave Quota" keyboardType="number-pad" value={sickLimit} onChangeText={setSickLimit} hint="Days per year" />
                    <Input label="Casual Leave Accrual" keyboardType="number-pad" value={accrual} onChangeText={setAccrual} hint="Working days to earn one casual leave" />
                </View>
            </Card>

            <Card padded={false}>
                <CardHeader title="Public Holidays" icon={CalendarDays} right={<Button size="sm" variant="ghost" icon={Plus} title="Add" onPress={() => setHolidays((h) => [...h, { name: "", date: null }])} />} />
                <View style={{ padding: 16, gap: 12 }}>
                    {holidays.length === 0 ? (
                        <Text variant="small" tone="muted">
                            No public holidays configured.
                        </Text>
                    ) : null}
                    {holidays.map((h, i) => (
                        <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                            <Input containerStyle={{ flex: 1.2 }} placeholder="Holiday Name" value={h.name} onChangeText={(name) => setHolidays((c) => c.map((x, idx) => (idx === i ? { ...x, name } : x)))} />
                            <View style={{ flex: 1 }}>
                                <DateField value={h.date} onChange={(date) => setHolidays((c) => c.map((x, idx) => (idx === i ? { ...x, date } : x)))} pattern="dd MMM yy" />
                            </View>
                            <Pressable hitSlop={8} onPress={() => setHolidays((c) => c.filter((_, idx) => idx !== i))} style={{ paddingBottom: 14 }}>
                                <Trash2 size={17} color={colors.destructive} />
                            </Pressable>
                        </View>
                    ))}
                </View>
            </Card>

            <Card padded={false}>
                <CardHeader
                    title="Attendance Locations"
                    icon={MapPin}
                    description="Check-ins within a location's radius record its name."
                    right={<Button size="sm" variant="ghost" icon={Plus} title="Add" onPress={() => setLocations((l) => [...l, { name: "", address: "", latitude: "", longitude: "", radius: "100" }])} />}
                />
                <View style={{ padding: 16, gap: 16 }}>
                    {locations.length === 0 ? (
                        <Text variant="small" tone="muted">
                            No locations — attendance is recorded with raw coordinates.
                        </Text>
                    ) : null}
                    {locations.map((l, i) => (
                        <View key={i} style={{ gap: 10, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                                <Input label="Location Name" containerStyle={{ flex: 1 }} placeholder="Main Office" value={l.name} onChangeText={(name) => setLoc(i, { name })} />
                                <Pressable hitSlop={8} onPress={() => setLocations((c) => c.filter((_, idx) => idx !== i))} style={{ paddingBottom: 14 }}>
                                    <Trash2 size={17} color={colors.destructive} />
                                </Pressable>
                            </View>
                            <Input label="Search & Set Address" placeholder="Enter full address…" value={l.address ?? ""} onChangeText={(address) => setLoc(i, { address })} />
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <Button size="sm" variant="outline" icon={Search} title="Find address" style={{ flex: 1 }} onPress={() => searchAddress(i)} />
                                <Button size="sm" variant="outline" icon={Crosshair} title="Use my location" style={{ flex: 1 }} onPress={() => useCurrent(i)} />
                            </View>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <Input label="Latitude" containerStyle={{ flex: 1 }} keyboardType="numbers-and-punctuation" value={l.latitude} onChangeText={(latitude) => setLoc(i, { latitude })} />
                                <Input label="Longitude" containerStyle={{ flex: 1 }} keyboardType="numbers-and-punctuation" value={l.longitude} onChangeText={(longitude) => setLoc(i, { longitude })} />
                                <Input label="Radius (m)" containerStyle={{ flex: 0.8 }} keyboardType="number-pad" value={l.radius} onChangeText={(radius) => setLoc(i, { radius })} />
                            </View>
                        </View>
                    ))}
                </View>
            </Card>

            <Button title="Save attendance settings" size="lg" loading={save.isPending} onPress={() => save.mutate()} />

            <Card padded={false}>
                <CardHeader title="Points" icon={Trophy} description="When the leaderboard starts over." />
                <View style={{ padding: 16 }}>
                    <Select
                        label="Reset period"
                        value={period}
                        onChange={(v) => {
                            if (!v) return;
                            setPeriod(v);
                            savePeriod.mutate(v);
                        }}
                        options={RESET_PERIODS}
                    />
                </View>
            </Card>
        </ScreenBody>
    );
}

function ScheduleEditor({ schedule }: { schedule: any }) {
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const [times, setTimes] = useState({
        shiftStartTime: schedule.shiftStartTime,
        lateThreshold: schedule.lateThreshold,
        halfDayThreshold: schedule.halfDayThreshold,
        overtimeThreshold: schedule.overtimeThreshold,
        shiftEndTime: schedule.shiftEndTime,
    });
    const save = useMutation({
        mutationFn: () => adminApi.updateShiftSchedule(workspaceId, schedule.id, times),
        onSuccess: () => {
            toast.success(`${schedule.name} timings saved`);
            qc.invalidateQueries({ queryKey: qk.shiftSchedules(workspaceId) });
        },
        onError: (e) => toast.fromError(e, "Failed to update shift schedule"),
    });
    const field = (key: keyof typeof times, label: string, extra?: Partial<typeof times>) => (
        <View style={{ flexBasis: "47%", flexGrow: 1 }}>
            <DateField label={label} mode="time" value={toTime(times[key])} onChange={(d) => setTimes((t) => ({ ...t, [key]: fromTime(d), ...(extra && d ? Object.fromEntries(Object.keys(extra).map((k) => [k, fromTime(d)])) : {}) }))} />
        </View>
    );
    return (
        <View style={{ gap: 10 }}>
            <Text variant="title">
                {schedule.name}{" "}
                <Text variant="caption" tone="muted">
                    · {schedule._count?.departments ?? 0} departments
                </Text>
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {field("shiftStartTime", "Shift Begins")}
                {field("lateThreshold", "Late Cutoff")}
                {field("halfDayThreshold", "Half Day Cutoff")}
                {field("overtimeThreshold", "Shift Ends / OT", { shiftEndTime: "" })}
            </View>
            <Button size="sm" variant="outline" title="Save timings" loading={save.isPending} onPress={() => save.mutate()} />
        </View>
    );
}
