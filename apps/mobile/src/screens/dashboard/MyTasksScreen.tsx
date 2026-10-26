import { useState } from "react";
import { ScrollView } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { MyTasksList, rangeMeta, type TaskRange } from "./widgets/TaskWidgets";
import type { RootStackParamList } from "../../navigation/types";

/** Home's All Tasks / My Tasks card in full: every task in the range, with Load more. */
export function MyTasksScreen({ route }: NativeStackScreenProps<RootStackParamList, "MyTasks">) {
    const { role } = useWorkspace();
    const [range, setRange] = useState<TaskRange>(route.params?.range ?? "today");
    return (
        <Screen>
            <ScreenHeader title={role === "OWNER" ? "All Tasks" : "My Tasks"} subtitle={rangeMeta(range)} showActions={false} />
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <MyTasksList range={range} onRangeChange={setRange} />
            </ScrollView>
        </Screen>
    );
}
