import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";
import { brand, fonts, radius } from "../../theme/tokens";
import { Text } from "../../components/ui";
import { DravaLockup, SmileArc } from "../../components/brand/Drava";

/**
 * The (auth) layout: a charcoal brand panel with the drava lockup, the smile-arc
 * line art and the page title, then the form on the plain background.
 */
export function AuthLayout({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    return (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}>
                <View style={[styles.hero, { paddingTop: insets.top + 28, backgroundColor: colors.hero }]}>
                    <SmileArc size={420} opacity={0.5} style={{ right: -150, top: -40 }} />
                    <DravaLockup size={20} />
                    <View style={{ gap: 8, marginTop: 56 }}>
                        <Text style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: colors.heroForeground }}>{title}</Text>
                        {description ? <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.heroMuted }}>{description}</Text> : null}
                    </View>
                </View>
                <View style={styles.form}>{children}</View>
                {footer ? <View style={{ marginTop: 22, alignItems: "center", paddingHorizontal: 24 }}>{footer}</View> : null}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    hero: { paddingHorizontal: 24, paddingBottom: 36, borderBottomRightRadius: 64, overflow: "hidden", borderColor: brand.charcoal },
    form: { paddingHorizontal: 24, paddingTop: 28, gap: 16, borderRadius: radius.lg },
});
