import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts } from "../../theme/tokens";
import { initials } from "../../lib/format";
import { Text } from "./Text";

/** drava secondary tints: solid pastel fills with dark ink initials. */
const HUES = ["#BBEDFF", "#E5BA99", "#9BFAF4", "#C1DDFB", "#D0F4F4", "#E8DBD1", "#9AC8FC", "#C3C3CB", "#CEF2FE", "#B6F59A"];

const hueFor = (seed: string) => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return HUES[Math.abs(h) % HUES.length];
};

export function Avatar({ name, image, size = 32, ring }: { name?: string | null; image?: string | null; size?: number; ring?: boolean }) {
    const { colors } = useTheme();
    const label = name ?? "?";
    const color = hueFor(label);
    return (
        <View
            style={[
                styles.base,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: image ? colors.muted : color,
                    borderColor: ring ? colors.background : "transparent",
                    borderWidth: ring ? 2 : 0,
                },
            ]}
        >
            {image ? (
                <Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={150} />
            ) : (
                <Text style={{ color: "#131416", fontFamily: fonts.bold, fontSize: Math.max(9, size * 0.36) }}>{initials(label)}</Text>
            )}
        </View>
    );
}

export function AvatarStack({ people, size = 26, max = 4 }: { people: { name?: string | null; image?: string | null }[]; size?: number; max?: number }) {
    const { colors } = useTheme();
    const shown = people.slice(0, max);
    const rest = people.length - shown.length;
    return (
        <View style={{ flexDirection: "row" }}>
            {shown.map((p, i) => (
                <View key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }}>
                    <Avatar name={p.name} image={p.image} size={size} ring />
                </View>
            ))}
            {rest > 0 ? (
                <View
                    style={[
                        styles.base,
                        { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.32, backgroundColor: colors.secondary, borderColor: colors.background, borderWidth: 2 },
                    ]}
                >
                    <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.34, color: colors.mutedForeground }}>+{rest}</Text>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    base: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
