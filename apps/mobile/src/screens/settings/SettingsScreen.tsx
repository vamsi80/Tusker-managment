import { useEffect, useState } from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Activity, Building, ShieldCheck, SlidersHorizontal } from "lucide-react-native";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { Tabs } from "../../components/ui";
import { ActivityTab, DepartmentsTab, GeneralTab, PermissionsTab } from "../../components/settings/SettingsTabs";
import type { RootStackParamList } from "../../navigation/types";

type Tab = "general" | "departments" | "permissions" | "activity";

/** /w/[workspaceId]/settings — settings-nav.tsx: General, Department, Permissions, Activity Log. */
export function SettingsScreen({ route }: NativeStackScreenProps<RootStackParamList, "Settings">) {
    const { role, isAdmin } = useWorkspace();
    const [tab, setTab] = useState<Tab>(route.params?.tab ?? "general");
    useEffect(() => {
        if (route.params?.tab) setTab(route.params.tab);
    }, [route.params?.tab]);
    const canPermissions = role === "OWNER" || role === "ADMIN";

    return (
        <Screen>
            <ScreenHeader title="Settings" />
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <Tabs
                    value={tab}
                    onChange={setTab}
                    items={[
                        { key: "general", label: "General", icon: SlidersHorizontal },
                        { key: "departments", label: "Department", icon: Building },
                        ...(canPermissions ? [{ key: "permissions" as const, label: "Permissions", icon: ShieldCheck }] : []),
                        ...(isAdmin ? [{ key: "activity" as const, label: "Activity Log", icon: Activity }] : []),
                    ]}
                />
            </View>
            <View style={{ flex: 1 }}>
                {tab === "general" ? <GeneralTab /> : null}
                {tab === "departments" ? <DepartmentsTab /> : null}
                {tab === "permissions" ? <PermissionsTab /> : null}
                {tab === "activity" ? <ActivityTab /> : null}
            </View>
        </Screen>
    );
}
