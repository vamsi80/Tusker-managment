import { useEffect, useState } from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CalendarCheck, CalendarOff, Settings, Trophy, Users } from "lucide-react-native";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { Tabs } from "../../components/ui";
import { MembersTab } from "../../components/team/MembersTab";
import { AttendanceTab } from "../../components/team/AttendanceTab";
import { LeavesTab } from "../../components/team/LeavesTab";
import { PointsTab } from "../../components/team/PointsTab";
import { TeamSettingsTab } from "../../components/team/TeamSettingsTab";
import type { RootStackParamList } from "../../navigation/types";

type Tab = "members" | "attendance" | "leaves" | "points" | "settings";

/** /w/[workspaceId]/team — team-nav.tsx: Members, Attendance, Leaves, Points, Settings. */
export function TeamScreen({ route }: NativeStackScreenProps<RootStackParamList, "Team">) {
    const { isAdmin } = useWorkspace();
    const [tab, setTab] = useState<Tab>(route.params?.tab ?? "members");
    useEffect(() => {
        if (route.params?.tab) setTab(route.params.tab);
    }, [route.params?.tab]);

    return (
        <Screen>
            <ScreenHeader title="Teams" />
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <Tabs
                    value={tab}
                    onChange={setTab}
                    items={[
                        { key: "members", label: "Members", icon: Users },
                        { key: "attendance", label: "Attendance", icon: CalendarCheck },
                        { key: "leaves", label: "Leaves", icon: CalendarOff },
                        { key: "points", label: "Points", icon: Trophy },
                        ...(isAdmin ? [{ key: "settings" as const, label: "Settings", icon: Settings }] : []),
                    ]}
                />
            </View>
            <View style={{ flex: 1 }}>
                {tab === "members" ? <MembersTab /> : null}
                {tab === "attendance" ? <AttendanceTab /> : null}
                {tab === "leaves" ? <LeavesTab /> : null}
                {tab === "points" ? <PointsTab /> : null}
                {tab === "settings" ? <TeamSettingsTab /> : null}
            </View>
        </Screen>
    );
}
