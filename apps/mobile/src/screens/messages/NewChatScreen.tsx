import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { conversationsApi } from "../../api/comms";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { displayName } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Avatar, ListSkeleton, SearchBar, Text } from "../../components/ui";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";
import { isOnline } from "./MessagesScreen";

/** new-dm-dialog.tsx — pick a teammate to message. */
export function NewChatScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "NewChat">) {
    const { colors } = useTheme();
    const { workspaceId } = useWorkspace();
    const [search, setSearch] = useState("");
    const members = useQuery({ queryKey: qk.chatMembers(workspaceId), queryFn: () => conversationsApi.members(workspaceId), enabled: !!workspaceId });
    const list = useMemo(
        () => (members.data ?? []).filter((m: any) => !search.trim() || displayName(m.user).toLowerCase().includes(search.trim().toLowerCase()) || m.user?.email?.toLowerCase().includes(search.trim().toLowerCase())),
        [members.data, search],
    );
    const open = useMutation({
        mutationFn: (m: any) => conversationsApi.open(workspaceId, m.user.id),
        onSuccess: (c: any, m: any) => navigation.replace("Chat", { conversationId: c.id, name: displayName(m.user), userId: m.user.id }),
        onError: (e) => toast.fromError(e, "Couldn't start the conversation"),
    });

    return (
        <Screen>
            <ScreenHeader title="New message" back showActions={false} />
            <FlatList
                data={list}
                keyExtractor={(m: any) => m.id}
                contentContainerStyle={{ padding: 16, gap: 2 }}
                ListHeaderComponent={<SearchBar value={search} onChangeText={setSearch} placeholder="Search people…" />}
                ListHeaderComponentStyle={{ marginBottom: 10 }}
                ListEmptyComponent={members.isLoading ? <ListSkeleton rows={6} /> : <Text tone="muted" center style={{ padding: 24 }}>No one found</Text>}
                renderItem={({ item: m }) => (
                    <Pressable onPress={() => open.mutate(m)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.secondary : "transparent" }]}>
                        <View>
                            <Avatar name={displayName(m.user)} size={42} />
                            {isOnline(m.user?.lastActiveAt) ? <View style={[styles.online, { borderColor: colors.background, backgroundColor: colors.success }]} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text variant="bodyMedium">{displayName(m.user)}</Text>
                            <Text variant="caption" tone="muted">
                                {m.designation || m.user?.email}
                            </Text>
                        </View>
                    </Pressable>
                )}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radius.md },
    online: { position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
});
