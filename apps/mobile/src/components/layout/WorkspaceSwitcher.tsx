import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Check, Plus } from "lucide-react-native";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";
import { Sheet, Text } from "../ui";

/** Only the system account switches between or creates workspaces; everyone else stays in theirs. */
export const SYSTEM_ACCOUNT_EMAIL = "digital@thewhitetusker.com";

export function useIsSystemAccount() {
    const auth = useAuth();
    return auth.status === "signedIn" && auth.user.email?.trim().toLowerCase() === SYSTEM_ACCOUNT_EMAIL;
}

/** The workspace logo: its first letter in lime on a charcoal tile (muted when not the active one). */
export function WorkspaceLogo({ name, size = 36, active = true }: { name?: string | null; size?: number; active?: boolean }) {
    const { colors } = useTheme();
    return (
        <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: active ? colors.hero : colors.secondary }]}>
            <Text style={{ fontFamily: fonts.heading, fontSize: size * 0.42, lineHeight: size * 0.56, includeFontPadding: false, color: active ? colors.primary : colors.mutedForeground }}>{(name?.trim() || "W").charAt(0).toUpperCase()}</Text>
        </View>
    );
}

/** team-switcher.tsx: every workspace you belong to, plus Create workspace (system account only). */
export function WorkspaceSwitcherSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const { workspaces, workspaceId, switchWorkspace } = useWorkspace();
    const isSystem = useIsSystemAccount();
    return (
        <Sheet open={open} onClose={onClose} title="Workspaces" description="Switch between the teams you belong to.">
            <View style={{ gap: 6 }}>
                {workspaces.map((ws) => {
                    const active = ws.id === workspaceId;
                    return (
                        <Pressable
                            key={ws.id}
                            onPress={() => {
                                onClose();
                                if (!active) {
                                    switchWorkspace(ws.id);
                                    navigation.navigate("Main", { screen: "Home" });
                                }
                            }}
                            style={({ pressed }) => [styles.row, { backgroundColor: active ? colors.accent : pressed ? colors.secondary : colors.card, borderColor: active ? colors.primaryInk : colors.border }]}
                        >
                            <WorkspaceLogo name={ws.name} size={38} active={active} />
                            <View style={{ flex: 1 }}>
                                <Text variant="title" numberOfLines={1}>
                                    {ws.name}
                                </Text>
                                {ws.workspaceRole ? (
                                    <Text variant="small" tone="muted">
                                        {ws.workspaceRole.charAt(0) + ws.workspaceRole.slice(1).toLowerCase()}
                                    </Text>
                                ) : null}
                            </View>
                            {active ? <Check size={18} color={colors.primaryInk} strokeWidth={2.4} /> : null}
                        </Pressable>
                    );
                })}
                {isSystem ? (
                    <Pressable
                        onPress={() => {
                            onClose();
                            navigation.navigate("CreateWorkspace");
                        }}
                        style={({ pressed }) => [styles.row, { borderStyle: "dashed", borderColor: colors.border, backgroundColor: pressed ? colors.secondary : "transparent" }]}
                    >
                        <View style={[styles.logo, { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.secondary }]}>
                            <Plus size={18} color={colors.mutedForeground} />
                        </View>
                        <Text variant="bodyMedium" tone="muted">
                            Create workspace
                        </Text>
                    </Pressable>
                ) : null}
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    logo: { alignItems: "center", justifyContent: "center" },
    row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
});
