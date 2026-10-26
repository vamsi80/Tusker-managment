import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { brand, fonts } from "../../theme/tokens";
import { Text } from "../ui/Text";

/**
 * The drava symbol: a half-sliced "D" that becomes a smile. Geometry follows the
 * brand book's construction grid (E = 0.28X): two E-squares on top and a quarter
 * ring centred on the first square's corner.
 */
export function DravaMark({ size = 24, color = brand.lime, outline }: { size?: number; color?: string; outline?: number }) {
    const fill = outline ? "none" : color;
    const stroke = outline ? color : undefined;
    return (
        <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="drava">
            <Rect x={0} y={0} width={28} height={28} fill={fill} stroke={stroke} strokeWidth={outline} />
            <Rect x={44} y={0} width={28} height={28} fill={fill} stroke={stroke} strokeWidth={outline} />
            <Path d="M72 28H100A72 72 0 0 1 28 100V72A44 44 0 0 0 72 28Z" fill={fill} stroke={stroke} strokeWidth={outline} />
        </Svg>
    );
}

/** Just the quarter ring, as thin line art for hero cards (the brand book's arc motif). */
export function SmileArc({ size = 220, color = brand.lime, opacity = 0.45, style }: { size?: number; color?: string; opacity?: number; style?: StyleProp<ViewStyle> }) {
    return (
        <View pointerEvents="none" style={[{ position: "absolute", width: size, height: size, opacity }, style]}>
            <Svg width={size} height={size} viewBox="0 0 100 100">
                <Path d="M72 28H100A72 72 0 0 1 28 100V72A44 44 0 0 0 72 28Z" fill="none" stroke={color} strokeWidth={0.5} />
            </Svg>
        </View>
    );
}

/** Logo lockup: symbol + lowercase wordmark, with the optional "core" product descriptor. */
export function DravaLockup({ size = 24, wordColor = brand.frost, product = true }: { size?: number; wordColor?: string; product?: boolean }) {
    return (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: size * 0.3 }}>
            <DravaMark size={size} />
            <Text style={{ fontFamily: fonts.display, fontSize: size * 1.36, lineHeight: size * 1.08, color: wordColor, includeFontPadding: false }}>drava</Text>
            {product ? (
                <View style={{ marginLeft: size * 0.2, paddingLeft: size * 0.35, borderLeftWidth: 1, borderLeftColor: "#8C8F95", marginBottom: size * 0.04 }}>
                    <Text style={{ fontFamily: fonts.headingSemibold, fontSize: size * 0.6, lineHeight: size * 0.62, color: brand.lime, includeFontPadding: false }}>core</Text>
                </View>
            ) : null}
        </View>
    );
}
