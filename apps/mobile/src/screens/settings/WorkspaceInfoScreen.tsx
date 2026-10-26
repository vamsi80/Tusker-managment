import { useEffect, useState } from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react-native";
import { workspacesApi } from "../../api/workspaces";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { Banner, Button, Card, CardHeader, Input, ListSkeleton, Text, confirm, prompt, tint } from "../../components/ui";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";
import { tone } from "../../theme/tone";

const FIELDS = {
    company: [
        ["name", "Workspace Name", true],
        ["legalName", "Legal Name", true],
        ["companyType", "Company Type", true, "e.g. Pvt Ltd"],
        ["industry", "Industry", true],
        ["gstNumber", "GST Number", true],
        ["msmeNumber", "MSME Number", true],
        ["panNumber", "PAN Number", false],
    ],
    contact: [
        ["email", "Email", true],
        ["phone", "Phone", true],
        ["website", "Website", false, "https://"],
    ],
    address: [
        ["addressLine1", "Line 1", true],
        ["addressLine2", "Line 2", false],
        ["city", "City", true],
        ["state", "State", true],
        ["country", "Country", true],
        ["pincode", "Pincode", true],
    ],
} as const;

/** /w/[workspaceId]/info — workspace-info-form.tsx (updateWorkspaceInfoSchema). */
export function WorkspaceInfoScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "WorkspaceInfo">) {
    const qc = useQueryClient();
    const { workspaceId, isAdmin, role, workspaces, switchWorkspace } = useWorkspace();
    const q = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspacesApi.get(workspaceId), enabled: !!workspaceId });
    const [form, setForm] = useState<Record<string, string>>({});
    useEffect(() => {
        if (q.data) setForm(Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, typeof v === "string" ? v : v == null ? "" : String(v)])));
    }, [q.data]);

    const save = useMutation({
        mutationFn: () => {
            for (const group of Object.values(FIELDS)) for (const [key, label, required] of group) if (required && !form[key]?.trim()) throw new Error(`${label} is required`);
            const pick = (k: string) => form[k]?.trim() || null;
            return workspacesApi.update(workspaceId, {
                name: form.name.trim(),
                legalName: form.legalName.trim(),
                gstNumber: form.gstNumber.trim(),
                panNumber: pick("panNumber"),
                companyType: form.companyType.trim(),
                industry: form.industry.trim(),
                msmeNumber: form.msmeNumber.trim(),
                description: pick("description"),
                email: form.email.trim(),
                phone: form.phone.trim(),
                website: form.website?.trim() || "",
                addressLine1: form.addressLine1.trim(),
                addressLine2: pick("addressLine2"),
                city: form.city.trim(),
                state: form.state.trim(),
                country: form.country.trim(),
                pincode: form.pincode.trim(),
            });
        },
        onSuccess: () => {
            toast.success("Workspace updated");
            qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
            qc.invalidateQueries({ queryKey: qk.workspaces() });
        },
        onError: (e) => toast.fromError(e, "Failed to update workspace"),
    });
    const remove = useMutation({
        mutationFn: () => workspacesApi.remove(workspaceId),
        onSuccess: async () => {
            toast.success("Workspace deleted");
            const next = workspaces.find((w) => w.id !== workspaceId);
            await qc.invalidateQueries({ queryKey: qk.workspaces() });
            if (next) switchWorkspace(next.id);
            navigation.goBack();
        },
        onError: (e) => toast.fromError(e, "Failed to delete workspace"),
    });

    const field = ([key, label, required, placeholder]: readonly [string, string, boolean, string?]) => (
        <Input key={key} label={label} required={required} placeholder={placeholder} value={form[key] ?? ""} editable={isAdmin} autoCapitalize={key === "email" || key === "website" ? "none" : undefined} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} />
    );

    return (
        <Screen>
            <ScreenHeader title="Workspace information" back showActions={false} />
            {q.isLoading ? (
                <View style={{ padding: 16 }}>
                    <ListSkeleton rows={6} avatar={false} />
                </View>
            ) : (
                <ScreenBody
                    footer={
                        isAdmin ? (
                            <BottomBar>
                                <Button title="Save changes" style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()} />
                            </BottomBar>
                        ) : undefined
                    }
                >
                    {!isAdmin ? <Banner tone="info">Only owners and admins can edit workspace information.</Banner> : null}
                    <Card padded={false}>
                        <CardHeader title="Company" />
                        <View style={{ padding: 16, gap: 12 }}>
                            {FIELDS.company.map(field)}
                            <Input label="Description" multiline value={form.description ?? ""} editable={isAdmin} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} />
                        </View>
                    </Card>
                    <Card padded={false}>
                        <CardHeader title="Contact" />
                        <View style={{ padding: 16, gap: 12 }}>{FIELDS.contact.map(field)}</View>
                    </Card>
                    <Card padded={false}>
                        <CardHeader title="Address" />
                        <View style={{ padding: 16, gap: 12 }}>{FIELDS.address.map(field)}</View>
                    </Card>
                    {role === "OWNER" ? (
                        <Card style={{ gap: 10, borderColor: tint(tone("danger"), 0.4) }}>
                            <Text variant="h3" tone="destructive">
                                Delete Workspace
                            </Text>
                            <Text variant="small" tone="muted">
                                Once you delete a workspace, there is no going back. This permanently deletes the workspace and all its associated data (projects, tasks, members).
                            </Text>
                            <Button
                                variant="destructive"
                                icon={Trash2}
                                title="Delete this workspace"
                                loading={remove.isPending}
                                onPress={async () => {
                                    if (!(await confirm({ title: "Delete this workspace?", message: "This action cannot be undone.", confirmLabel: "Continue", destructive: true }))) return;
                                    const typed = await prompt({ title: "Type the workspace name to confirm", placeholder: form.name, confirmLabel: "Delete", destructive: true });
                                    if (typed && typed === form.name) remove.mutate();
                                    else if (typed !== null) toast.error("The name didn't match");
                                }}
                            />
                        </Card>
                    ) : null}
                </ScreenBody>
            )}
        </Screen>
    );
}
