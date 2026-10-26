import { useEffect, useState, type ComponentType } from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, KeyRound, ListTodo, LogOut, Palette, Phone, Target, Timer, User } from "lucide-react-native";
import { userApi } from "../../api/comms";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { displayName } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Avatar, Badge, Button, Card, CardHeader, Divider, Input, ListRow, Skeleton, Text, confirm, tint } from "../../components/ui";
import { Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";

/**
 * The account page: who you are, your task record (GET /user/profile stats),
 * the editable details (PATCH /user/profile) and account actions.
 */
export function ProfileScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Profile">) {
    const { colors, shadow } = useTheme();
    const qc = useQueryClient();
    const auth = useAuth();
    const { role } = useWorkspace();
    const q = useQuery({ queryKey: qk.profile(), queryFn: () => userApi.profile() });
    const user = { ...(auth.status === "signedIn" ? auth.user : {}), ...(q.data?.user ?? {}) } as any;
    const stats = q.data?.stats;

    const [form, setForm] = useState({ name: "", surname: "", phoneNumber: "" });
    useEffect(() => {
        if (q.data?.user) setForm({ name: q.data.user.name ?? "", surname: q.data.user.surname ?? "", phoneNumber: q.data.user.phoneNumber ?? "" });
    }, [q.data?.user]);
    const dirty =
        !!q.data?.user &&
        (form.name !== (q.data.user.name ?? "") || form.surname !== (q.data.user.surname ?? "") || form.phoneNumber !== (q.data.user.phoneNumber ?? ""));

    const save = useMutation({
        mutationFn: () => {
            if (!form.name.trim()) throw new Error("Full name is required");
            return userApi.updateProfile({ name: form.name.trim(), surname: form.surname.trim(), phoneNumber: form.phoneNumber.trim() });
        },
        onSuccess: async () => {
            toast.success("Profile updated");
            await qc.invalidateQueries({ queryKey: qk.profile() });
            auth.refresh();
        },
        onError: (e) => toast.fromError(e, "Failed to update profile"),
    });

    return (
        <Screen>
            <ScreenHeader title="Profile" back showActions={false} />
            <ScreenBody refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
                <Card style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
                    <View style={[{ borderRadius: 52, borderWidth: 4, borderColor: colors.background, backgroundColor: colors.background }, shadow.lg]}>
                        <Avatar name={displayName(user)} image={user.image} size={96} />
                    </View>
                    <View style={{ alignItems: "center", gap: 2 }}>
                        <Text variant="h2" center>
                            {displayName(user)}
                        </Text>
                        {user.surname && user.name && user.surname !== user.name ? (
                            <Text variant="body" tone="muted">
                                {user.name}
                            </Text>
                        ) : null}
                        <Text variant="bodyMedium" tone="muted">
                            {user.email}
                        </Text>
                    </View>
                    {role ? <Badge label={role.charAt(0) + role.slice(1).toLowerCase()} color={colors.info} style={{ alignSelf: "center" }} /> : null}
                </Card>

                <View style={styles.grid}>
                    {q.isLoading && !stats ? (
                        [0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} rounded={16} style={styles.tile} />)
                    ) : (
                        <>
                            <Stat icon={ClipboardList} color={colors.info} label="Total tasks" value={stats?.totalTasks ?? 0} />
                            <Stat icon={CheckCircle2} color={colors.success} label="Completed" value={stats?.completedTasks ?? 0} />
                            <Stat icon={Target} color={colors.primaryInk} label="Completion" value={`${stats?.completionRate ?? 0}%`} />
                            <Stat icon={Timer} color={colors.leave} label="Days on drava core" value={stats?.experienceDays ?? 0} />
                        </>
                    )}
                </View>

                <Card padded={false}>
                    <CardHeader title="Personal details" icon={User} />
                    <View style={{ padding: 16, gap: 12 }}>
                        <Input label="Full name" required value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))} autoComplete="name" />
                        <Input label="Nickname" hint="How your name appears to your team" value={form.surname} onChangeText={(surname) => setForm((f) => ({ ...f, surname }))} />
                        <Input
                            label="Phone number"
                            icon={Phone}
                            keyboardType="phone-pad"
                            autoComplete="tel"
                            value={form.phoneNumber}
                            onChangeText={(phoneNumber) => setForm((f) => ({ ...f, phoneNumber }))}
                        />
                        <Input label="Email" value={user.email ?? ""} editable={false} hint="Your sign-in email can't be changed here." />
                        <Button title="Save changes" loading={save.isPending} disabled={!dirty} onPress={() => save.mutate()} />
                    </View>
                </Card>

                <Card padded={false} style={{ paddingVertical: 6 }}>
                    <ListRow icon={KeyRound} label="Change password" onPress={() => navigation.navigate("ChangePassword")} />
                    <ListRow icon={ListTodo} label="My Space" description="Your info and personal to-do list" onPress={() => navigation.navigate("MySpace")} />
                    <ListRow icon={Palette} label="Appearance" description="Light, dark or match the system" onPress={() => navigation.navigate("Settings", { tab: "general" })} />
                    <Divider style={{ marginVertical: 4, marginHorizontal: 14 }} />
                    <ListRow
                        icon={LogOut}
                        label="Log out"
                        destructive
                        onPress={async () => {
                            if (await confirm({ title: "Log out of drava core?", confirmLabel: "Log out", destructive: true })) auth.signOut();
                        }}
                    />
                </Card>
            </ScreenBody>
        </Screen>
    );
}

function Stat({ icon: Icon, color, label, value }: { icon: ComponentType<{ size?: number; color?: string }>; color: string; label: string; value: string | number }) {
    const { colors } = useTheme();
    return (
        <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statIcon, { backgroundColor: tint(color, 0.12) }]}>
                <Icon size={16} color={color} />
            </View>
            <Text variant="h2">{value}</Text>
            <Text variant="overline" tone="muted">
                {label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tile: { flexBasis: "47%", flexGrow: 1, gap: 6, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
    statIcon: { alignSelf: "flex-start", padding: 7, borderRadius: 9 },
});
