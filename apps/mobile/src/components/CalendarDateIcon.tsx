import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { FONTS } from "../constants/theme";

interface Props {
    size?: number;
    /** Override the shown day number; defaults to today's date. */
    day?: number;
    /** Override the shown month label; defaults to today's month, e.g. "SEP". */
    month?: string;
}

const INK = "#18181b";
/** Design reference size the proportions below were tuned at — scale everything off this. */
const BASE = 32;

/**
 * The classic "tear-off" desk calendar glyph (spiral rings + dark month band +
 * day number) used for the Calendar entry point, mirroring the icon style of
 * the app's other widgets. Colors are fixed rather than theme-driven — like a
 * physical calendar page, it reads as the same object in light or dark mode.
 */
export default function CalendarDateIcon({ size = 28, day, month }: Props) {
    const now = new Date();
    const shownDay = day ?? now.getDate();
    const shownMonth = (month ?? now.toLocaleDateString("en-US", { month: "short" })).toUpperCase();

    const scale = size / BASE;
    const bodyWidth = size;
    const bodyHeight = Math.round(38 * scale);
    const bandHeight = Math.round(13 * scale);
    const ringSize = Math.max(4, Math.round(6 * scale));
    const ringGap = Math.round(18 * scale);
    const radius = Math.max(3, Math.round(6 * scale));

    return (
        <View style={[styles.container, { width: bodyWidth, height: bodyHeight + ringSize * 0.6 }]}>
            <View style={[styles.rings, { width: ringGap }]}>
                <View style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]} />
                <View style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]} />
            </View>

            <View
                style={[
                    styles.body,
                    {
                        width: bodyWidth,
                        height: bodyHeight,
                        marginTop: ringSize * 0.5,
                        borderRadius: radius,
                    },
                ]}
            >
                <View style={[styles.band, { height: bandHeight, borderTopLeftRadius: radius, borderTopRightRadius: radius }]}>
                    <Text
                        style={[styles.monthText, { fontSize: Math.max(6, Math.round(8 * scale)), letterSpacing: 0.3 * scale }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {shownMonth}
                    </Text>
                </View>
                <View style={styles.dayWrap}>
                    <Text
                        style={[styles.dayText, { fontSize: Math.max(9, Math.round(16 * scale)) }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {shownDay}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { alignItems: "center" },
    rings: { position: "absolute", top: 0, flexDirection: "row", justifyContent: "space-between", zIndex: 2, alignSelf: "center" },
    ring: { backgroundColor: INK },
    body: {
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.15)",
        overflow: "hidden",
    },
    band: { backgroundColor: INK, width: "100%", alignItems: "center", justifyContent: "center" },
    monthText: { fontFamily: FONTS.bold, color: "#ffffff" },
    dayWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    dayText: { fontFamily: FONTS.extrabold, color: INK },
});
