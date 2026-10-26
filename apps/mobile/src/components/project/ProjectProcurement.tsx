import { FlatList, RefreshControl, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Package, Plus } from "lucide-react-native";
import { indentsApi } from "../../api/procurement";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { useProjectAccess } from "../../hooks/useProjectAccess";
import { qk } from "../../lib/query";
import { can } from "../../lib/taskRules";
import { useTheme } from "../../theme/ThemeProvider";
import { Button, EmptyState, ListSkeleton, Text } from "../ui";
import { IndentCard } from "../procurement/IndentCard";

/** p/[slug]/procurement: this project's indents and "Create Indent". */
export function ProjectProcurement({ projectId }: { projectId: string }) {
    const { colors } = useTheme();
    const navigation = useNavigation<any>();
    const { workspaceId } = useWorkspace();
    const { access } = useProjectAccess(projectId);
    const q = useQuery({ queryKey: qk.indents(workspaceId), queryFn: () => indentsApi.list(workspaceId), enabled: !!workspaceId });
    const indents = (q.data ?? []).filter((i) => i.projectId === projectId || i.project?.id === projectId);
    const canRaise = can(access, "indent:raise") || access.isWorkspaceAdmin;
    const create = () => navigation.navigate("IndentForm", { projectId, raisedInProject: true });

    return (
        <FlatList
            data={indents}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => <IndentCard indent={item} />}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primaryInk} />}
            ListHeaderComponent={
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                        <Text variant="h3">Procurement</Text>
                        <Text variant="small" tone="muted">
                            Material requests raised for this project
                        </Text>
                    </View>
                    {canRaise ? <Button size="sm" icon={Plus} title="Create Indent" onPress={create} /> : null}
                </View>
            }
            ListEmptyComponent={
                q.isLoading ? (
                    <ListSkeleton rows={3} avatar={false} />
                ) : (
                    <EmptyState icon={Package} title="No Indents Created Yet" description="Raise an indent to request materials for this project." actionLabel={canRaise ? "Create Indent" : undefined} onAction={canRaise ? create : undefined} />
                )
            }
        />
    );
}
