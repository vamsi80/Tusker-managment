import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ArrowRight, Check, LogIn, LogOut } from "lucide-react-native";
import { attendanceApi } from "../../api/people";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { fmtTime, toDateOnlyString } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { brand, fonts } from "../../theme/tokens";
import { SmileArc } from "../brand/Drava";
import { Sheet, Text } from "../ui";
import { AttendanceLogger } from "./AttendanceLogger";

const LIME = brand.lime;
const INK = brand.ink;

type State = "none" | "in" | "out";

/** The hero is charcoal in both themes — the brand's signature surface. */
const PALETTES = {
    light: {
        text: "#F1F4F5",
        textSoft: "#D8E2E5",
        textMuted: "#C3C3CB",
        headline: "#F1F4F5",
        strip: "rgba(19,20,22,0.28)",
        stripBorder: "rgba(216,226,229,0.14)",
        divider: "rgba(216,226,229,0.18)",
        meridiem: LIME,
        green: LIME,
        doneText: "#F1F4F5",
        idle: brand.apricot,
        off: brand.mist,
    },
    dark: {
        text: "#F1F4F5",
        textSoft: "#D8E2E5",
        textMuted: "#C3C3CB",
        headline: "#F1F4F5",
        strip: "rgba(19,20,22,0.28)",
        stripBorder: "rgba(216,226,229,0.14)",
        divider: "rgba(216,226,229,0.18)",
        meridiem: LIME,
        green: LIME,
        doneText: "#F1F4F5",
        idle: brand.apricot,
        off: brand.mist,
    },
};
type Palette = (typeof PALETTES)["light"];

/**
 * Home's attendance hero — the charcoal drava card with the smile corner and
 * arc line art: a live clock, a status pill (pulsing while on shift), a strip
 * of today's in / out / worked, and the check-in / check-out action. Everything opens the attendance logger,
 * which applies the workspace's location and photo rules.
 */
export function AttendanceHeroCard() {
    const { scheme, colors } = useTheme();
    const { workspaceId } = useWorkspace();
    const [open, setOpen] = useState(false);
    const now = useClock();
    const today = useQuery({
        queryKey: qk.attendanceToday(workspaceId),
        queryFn: () => attendanceApi.today(workspaceId, toDateOnlyString(new Date())),
        enabled: !!workspaceId,
        staleTime: 60_000,
    });
    const record = today.data;
    const state: State = record?.checkOut ? "out" : record?.checkIn ? "in" : "none";

    const worked = (() => {
        if (!record?.checkIn) return "—";
        const end = record.checkOut ? new Date(record.checkOut) : now;
        const mins = Math.max(0, Math.floor((end.getTime() - new Date(record.checkIn).getTime()) / 60_000));
        return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
    })();

    const [time, meridiem] = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).split(" ");
    const dateLabel = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
    const headline = state === "in" ? "You're on the clock" : state === "out" ? "Shift complete — nice work" : "Ready to start your day?";
    const c: Palette = PALETTES[scheme === "dark" ? "dark" : "light"];

    const press = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setOpen(true);
    };

    return (
        <>
            <Pressable
                onPress={press}
                style={({ pressed }) => [styles.card, { backgroundColor: colors.hero, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
                accessibilityRole="button"
                accessibilityLabel={`Attendance. ${headline}`}
            >
                {/* The brand book's quarter-ring line art, half off the card's corner. */}
                <SmileArc size={230} opacity={state === "in" ? 0.55 : 0.4} style={{ right: -92, top: -66 }} />

                <View style={styles.topRow}>
                    <Text style={[styles.date, { color: c.textSoft }]} numberOfLines={1}>
                        {dateLabel}
                    </Text>
                    <StatusPill state={state} c={c} />
                </View>

                <View style={styles.clockRow}>
                    <Text style={[styles.clock, { color: c.text }]}>{time}</Text>
                    <Text style={[styles.meridiem, { color: c.meridiem }]}>{meridiem}</Text>
                </View>
                <Text style={[styles.headline, { color: c.headline }]}>{headline}</Text>

                <View style={[styles.strip, { backgroundColor: c.strip, borderColor: c.stripBorder }]}>
                    <Stat c={c} label="Check in" value={record?.checkIn ? fmtTime(record.checkIn) : "--:--"} />
                    <View style={[styles.divider, { backgroundColor: c.divider }]} />
                    <Stat c={c} label="Check out" value={record?.checkOut ? fmtTime(record.checkOut) : "--:--"} />
                    <View style={[styles.divider, { backgroundColor: c.divider }]} />
                    <Stat c={c} label="Worked" value={worked} highlight={state === "in"} />
                </View>

                {state === "out" ? (
                    <View style={[styles.action, styles.actionDone]}>
                        <Check size={18} color={c.green} strokeWidth={2.6} />
                        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: c.doneText }}>Attendance marked for today</Text>
                    </View>
                ) : (
                    <Pressable onPress={press} style={({ pressed }) => [styles.action, state === "in" ? styles.actionOut : { backgroundColor: LIME }, { opacity: pressed ? 0.9 : 1 }]}>
                        {state === "in" ? <LogOut size={18} color="#F1F4F5" /> : <LogIn size={18} color={INK} />}
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: state === "in" ? "#F1F4F5" : INK }}>{state === "in" ? "Check out" : "Check in now"}</Text>
                        <View style={[styles.arrow, { backgroundColor: state === "in" ? "rgba(255,255,255,0.12)" : "rgba(14,26,7,0.12)" }]}>
                            <ArrowRight size={15} color={state === "in" ? "#F1F4F5" : INK} strokeWidth={2.6} />
                        </View>
                    </Pressable>
                )}
            </Pressable>
            <Sheet open={open} onClose={() => setOpen(false)}>
                <AttendanceLogger />
            </Sheet>
        </>
    );
}

/** The current time, re-rendered on each minute boundary. */
function useClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        let id: ReturnType<typeof setTimeout>;
        const tick = () => {
            setNow(new Date());
            id = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
        };
        id = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
        return () => clearTimeout(id);
    }, []);
    return now;
}

function StatusPill({ state, c }: { state: State; c: Palette }) {
    const pulse = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (state !== "in") return;
        const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }));
        loop.start();
        return () => loop.stop();
    }, [state, pulse]);
    const color = state === "in" ? c.green : state === "out" ? c.off : c.idle;
    const label = state === "in" ? "On shift" : state === "out" ? "Checked out" : "Not checked in";
    return (
        <View style={[styles.pill, { borderColor: color + "55", backgroundColor: color + "1f" }]}>
            <View style={{ width: 8, height: 8, alignItems: "center", justifyContent: "center" }}>
                {state === "in" ? (
                    <Animated.View
                        style={{
                            position: "absolute",
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: color,
                            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
                        }}
                    />
                ) : null}
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
            </View>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color }}>{label}</Text>
        </View>
    );
}

function Stat({ c, label, value, highlight }: { c: Palette; label: string; value: string; highlight?: boolean }) {
    return (
        <View style={{ flex: 1, alignItems: "center", gap: 1 }}>
            <Text style={{ fontFamily: fonts.heading, fontSize: 14, color: highlight ? c.green : c.text }}>{value}</Text>
            <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: c.textMuted }}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    // The smile corner: one larger bottom-right radius, from the drava symbol.
    card: { borderRadius: 24, borderBottomRightRadius: 52, overflow: "hidden", padding: 18, gap: 12 },
    topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    date: { flex: 1, fontFamily: fonts.medium, fontSize: 12 },
    pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
    clockRow: { flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: -4 },
    clock: { fontFamily: fonts.heading, fontSize: 36, lineHeight: 42, letterSpacing: -1 },
    meridiem: { fontFamily: fonts.semibold, fontSize: 13, marginBottom: 7 },
    headline: { fontFamily: fonts.medium, fontSize: 14, marginTop: -8 },
    strip: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
    divider: { width: 1, height: 24 },
    action: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 14 },
    actionOut: { backgroundColor: "rgba(19,20,22,0.38)", borderWidth: 1, borderColor: "rgba(216,226,229,0.22)" },
    actionDone: { backgroundColor: "rgba(146,255,95,0.12)", borderWidth: 1, borderColor: "rgba(146,255,95,0.35)" },
    arrow: { position: "absolute", right: 8, width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
