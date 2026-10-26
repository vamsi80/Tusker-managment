import { useEffect, useState } from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ClipboardList, FileText, LayoutDashboard, Package, Receipt } from "lucide-react-native";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { Screen, ScreenHeader } from "../../components/layout/Screen";
import { EmptyState, Tabs } from "../../components/ui";
import { IndentsRegister, MaterialsHub, ProcurementDashboard, PurchaseOrdersList, RfqList } from "../../components/procurement/ProcurementTabs";
import type { RootStackParamList } from "../../navigation/types";

type Tab = "dashboard" | "indents" | "pos" | "materials" | "rfqs";

/** /w/[workspaceId]/procurement — procurement-tabs.tsx: Dashboard, Indents, POs, Materials, RFQs. */
export function ProcurementScreen({ route }: NativeStackScreenProps<RootStackParamList, "Procurement">) {
    const { can } = useWorkspace();
    const [tab, setTab] = useState<Tab>(route.params?.tab ?? "dashboard");
    const [status, setStatus] = useState<string[] | undefined>();
    useEffect(() => {
        if (route.params?.tab) setTab(route.params.tab);
    }, [route.params?.tab]);

    if (!can("procurement:view")) {
        return (
            <Screen>
                <ScreenHeader title="Procurement" />
                <EmptyState title="You don't have access to Procurement." description="Ask a workspace admin to enable it in Settings → Permissions." />
            </Screen>
        );
    }

    return (
        <Screen>
            <ScreenHeader title="Procurement" />
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <Tabs
                    value={tab}
                    onChange={(t) => {
                        setStatus(undefined);
                        setTab(t);
                    }}
                    items={[
                        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
                        { key: "indents", label: "Indents", icon: ClipboardList },
                        { key: "pos", label: "Purchase Orders", icon: Receipt },
                        { key: "materials", label: "Materials", icon: Package },
                        { key: "rfqs", label: "RFQs", icon: FileText },
                    ]}
                />
            </View>
            <View style={{ flex: 1 }}>
                {tab === "dashboard" ? (
                    <ProcurementDashboard
                        onOpenTab={(t, s) => {
                            setStatus(s);
                            setTab(t);
                        }}
                    />
                ) : null}
                {tab === "indents" ? <IndentsRegister key={status?.join(",")} initialStatus={status} /> : null}
                {tab === "pos" ? <PurchaseOrdersList /> : null}
                {tab === "materials" ? <MaterialsHub key={status?.join(",")} initialStatus={status} /> : null}
                {tab === "rfqs" ? <RfqList /> : null}
            </View>
        </Screen>
    );
}
