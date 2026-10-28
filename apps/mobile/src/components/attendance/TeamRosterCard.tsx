import { useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ArrowUpRight, UserRound } from "lucide-react-native";
import { attendanceApi } from "../../api/people";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { displayName, fmtTime, toDateOnlyString } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { brand, fonts } from "../../theme/tokens";
import { SmileArc } from "../brand/Drava";
import { Avatar, Sheet, Text } from "../ui";
import { AttendanceLogger } from "./AttendanceLogger";

type Bucket = "present" | "late" | "absent" | "leave";
type Row = { member: any; attendance: any };

/** Charcoal in both themes, like the attendance hero it replaces. */
const C = {
    text: "#F1F4F5",
    soft: "#D8E2E5",
    muted: "#C3C3CB",
    strip: "rgba(19,20,22,0.28)",
    stripBorder: "rgba(216,226,229,0.14)",
    chip: "rgba(216,226,229,0.22)",
};

const BUCKETS: { key: Bucket; label: string; color: string }[] = [
    { key: "present", label: "Present", color: brand.lime },
    { key: "late", label: "Late", color: brand.apricot },
    { key: "absent", label: "Absent", color: brand.coral },
    { key: "leave", label: "On leave", color: brand.sky },
];

/** Present counts everyone who checked in, late included, as the old app's roster did. */
const bucketOf = (r: Row): Bucket => {
    const a = r.attendance;
    if (a?.checkIn) return a.status === "LATE" ? "late" : "present";
    return a?.status === "ON_LEAVE" ? "leave" : "absent";
};

const checkInTime = (r: Row) => new Date(r.attendance.checkIn).getTime();
const byName = (a: Row, b: Row) => displayName(a.member.user).localeCompare(displayName(b.member.user));

/**
 * Home's team roster for owners, admins and the system account, in place of
 * the personal check-in hero: today's present / late / absent / on-leave
 * counts. Holding (or tapping) a count pops a small box beside it with who's in
 * it and when they checked in; "My attendance" still opens the logger.
 */
export function TeamRosterCard() {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const { workspaceId } = useWorkspace();
    const [popover, setPopover] = useState<{ bucket: Bucket; anchor: Anchor } | null>(null);
    const tiles = useRef<Partial<Record<Bucket, View | null>>>({});
    const [loggerOpen, setLoggerOpen] = useState(false);
    const today = toDateOnlyString(new Date());

    const q = useQuery({
        queryKey: qk.register(workspaceId, today),
        queryFn: () => attendanceApi.register(workspaceId, today),
        enabled: !!workspaceId,
        refetchInterval: 60_000,
    });

    const lists = useMemo(() => {
        const rows = q.data ?? [];
        const of = (b: Bucket) => rows.filter((r) => bucketOf(r) === b);
        return {
            // "Present" lists everyone in, late or not; both lists put the latest check-in first.
            present: rows.filter((r) => r.attendance?.checkIn).sort((a, b) => checkInTime(b) - checkInTime(a)),
            late: of("late").sort((a, b) => checkInTime(b) - checkInTime(a)),
            absent: of("absent").sort(byName),
            leave: of("leave").sort(byName),
        } satisfies Record<Bucket, Row[]>;
    }, [q.data]);

    const total = q.data?.length ?? 0;
    const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

    const show = (b: Bucket) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        // Android's measureInWindow leaves out the status bar, while the popover's modal starts at the top of the screen.
        const offset = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
        tiles.current[b]?.measureInWindow((x, y, width, height) => setPopover({ bucket: b, anchor: { x, y: y + offset, width, height } }));
    };

    return (
        <>
            <View style={[styles.card, { backgroundColor: colors.hero }]}>
                <SmileArc size={180} opacity={0.35} style={{ right: -76, top: -60 }} />

                <View style={styles.topRow}>
                    <Pressable onPress={() => navigation.navigate("Team", { tab: "attendance" })} hitSlop={6} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Open attendance">
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Text style={[styles.title, { color: C.text }]}>Team roster</Text>
                            <ArrowUpRight size={18} color={C.soft} />
                        </View>
                        <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: C.muted }} numberOfLines={1}>
                            {dateLabel} · {q.isLoading ? "Loading…" : `${lists.present.length} of ${total} checked in`}
                        </Text>
                    </Pressable>
                    <Pressable onPress={() => setLoggerOpen(true)} hitSlop={6} style={({ pressed }) => [styles.mine, { opacity: pressed ? 0.7 : 1 }]}>
                        <UserRound size={13} color={C.text} />
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: C.text }}>My attendance</Text>
                    </Pressable>
                </View>

                <View style={[styles.strip, { backgroundColor: C.strip, borderColor: C.stripBorder }]}>
                    {BUCKETS.map((b) => (
                        <Pressable
                            key={b.key}
                            ref={(el) => {
                                tiles.current[b.key] = el;
                            }}
                            onPress={() => show(b.key)}
                            onLongPress={() => show(b.key)}
                            delayLongPress={250}
                            style={({ pressed }) => [styles.stat, pressed && { backgroundColor: b.color + "1f" }]}
                            accessibilityRole="button"
                            accessibilityLabel={`${b.label}: ${lists[b.key].length}. Show who`}
                        >
                            <Text style={{ fontFamily: fonts.heading, fontSize: 20, color: b.color }}>{q.isLoading ? "–" : lists[b.key].length}</Text>
                            <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: C.muted }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                                {b.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            {popover ? <RosterPopover bucket={popover.bucket} anchor={popover.anchor} rows={lists[popover.bucket]} onClose={() => setPopover(null)} /> : null}
            <Sheet open={loggerOpen} onClose={() => setLoggerOpen(false)}>
                <AttendanceLogger />
            </Sheet>
        </>
    );
}

type Anchor = { x: number; y: number; width: number; height: number };

const POP_WIDTH = 264;
const POP_MAX_HEIGHT = 300;
const EDGE = 12;

/** A small box beside the tapped count, below it unless that would run off screen. */
function RosterPopover({ bucket, anchor, rows, onClose }: { bucket: Bucket; anchor: Anchor; rows: Row[]; onClose: () => void }) {
    const { colors, shadow } = useTheme();
    const { width: screenW, height: screenH } = useWindowDimensions();
    const meta = BUCKETS.find((b) => b.key === bucket)!;
    const width = Math.min(POP_WIDTH, screenW - EDGE * 2);
    // Start at the tapped tile's left edge, pulled back in only where it would run off the right.
    const left = Math.max(EDGE, Math.min(anchor.x, screenW - width - EDGE));
    const below = anchor.y + anchor.height + 6;
    const place = below + POP_MAX_HEIGHT < screenH - EDGE ? { top: below } : { bottom: screenH - anchor.y + 6 };
    const empty = bucket === "absent" ? "Everyone's in today" : `No one ${meta.label.toLowerCase()} yet`;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
            <View style={[styles.pop, shadow.lg, place, { left, width, backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.popHeader}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.color }} />
                    <Text variant="label" style={{ flex: 1 }}>
                        {meta.label} · {rows.length}
                    </Text>
                </View>
                {rows.length ? (
                    <ScrollView style={{ maxHeight: POP_MAX_HEIGHT - 44 }} nestedScrollEnabled showsVerticalScrollIndicator={rows.length > 6}>
                        {rows.map((r, i) => {
                            const a = r.attendance;
                            const name = displayName(r.member.user);
                            const late = bucketOf(r) === "late";
                            return (
                                <View key={r.member.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                                    <Avatar name={name} image={r.member.user?.image} size={26} />
                                    <Text variant="small" weight="semibold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                        {name}
                                    </Text>
                                    {a?.checkIn ? (
                                        <Text variant="caption" numberOfLines={1} style={{ color: late ? brand.apricot : colors.mutedForeground }}>
                                            {fmtTime(a.checkIn)}
                                            {a.checkOut ? ` – ${fmtTime(a.checkOut)}` : ""}
                                        </Text>
                                    ) : null}
                                </View>
                            );
                        })}
                    </ScrollView>
                ) : (
                    <Text variant="small" tone="muted" center style={{ paddingVertical: 14 }}>
                        {empty}
                    </Text>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: 22, borderBottomRightRadius: 44, overflow: "hidden", padding: 16, gap: 12 },
    topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    mine: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.chip, backgroundColor: C.strip },
    title: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
    strip: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 14, borderWidth: 1 },
    stat: { flex: 1, minWidth: 0, alignItems: "center", gap: 1, paddingVertical: 8, borderRadius: 10 },
    pop: { position: "absolute", borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingBottom: 6 },
    popHeader: { flexDirection: "row", alignItems: "center", gap: 8, height: 38 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
});
