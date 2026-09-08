import React from "react";
import { View, StyleSheet } from "react-native";

interface Props {
    size?: number;
}

/** Lighter brand orange — the highlight tone from the Home screen's check-in gradient. */
const BUBBLE = "#ffd694";
/** "Ink on primary" — same token used elsewhere in the app for text/marks on the primary color. */
const FACE = "#2b1c04";
/** Design reference size the coordinates below were tuned at — scale off this. */
const BASE = 44;

/**
 * The AI entry point's avatar: a friendly chat-bubble bot — a flat, plain
 * rounded speech bubble with a tail, two curved happy eyes, and one smiling
 * curve. Built from plain Views only (no react-native-svg or other native
 * view manager), so it renders on any existing dev-client build without a
 * native rebuild. Colors are fixed rather than theme-driven, like a physical
 * mascot/logo, so it reads the same in light or dark mode.
 */
export default function AIBotAvatar({ size = 44 }: Props) {
    const s = size / BASE;
    const px = (n: number) => Math.round(n * s * 10) / 10;

    return (
        <View style={{ width: px(44), height: px(42) }}>
            {/* Bubble body */}
            <View style={[styles.abs, styles.bubble, { top: 0, left: 0, width: px(44), height: px(34), borderRadius: px(15) }]} />

            {/* Tail */}
            <View
                style={[
                    styles.abs,
                    {
                        top: px(30),
                        left: px(13),
                        width: 0,
                        height: 0,
                        borderLeftWidth: px(6),
                        borderRightWidth: px(6),
                        borderTopWidth: px(9),
                        borderLeftColor: "transparent",
                        borderRightColor: "transparent",
                        borderTopColor: BUBBLE,
                    },
                ]}
            />

            {/* Eyes — curved happy arcs (top half of a ring, clipped) */}
            {[px(11), px(24)].map((left, i) => (
                <View key={i} style={[styles.abs, { top: px(13), left, width: px(9), height: px(4.5), overflow: "hidden" }]}>
                    <View
                        style={{
                            width: px(9),
                            height: px(9),
                            borderRadius: px(4.5),
                            borderWidth: px(1.6),
                            borderColor: FACE,
                        }}
                    />
                </View>
            ))}

            {/* Smile — bottom half of a ring, clipped to an arc */}
            <View style={[styles.abs, { top: px(23), left: px(16), width: px(12), height: px(6), overflow: "hidden" }]}>
                <View
                    style={{
                        width: px(12),
                        height: px(12),
                        borderRadius: px(6),
                        borderWidth: px(1.8),
                        borderColor: FACE,
                        transform: [{ translateY: px(-6) }],
                    }}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    abs: { position: "absolute" },
    bubble: { backgroundColor: BUBBLE },
});
