import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react-native";
import { projectsApi, type ProjectInput } from "../../api/projects";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { PROJECT_CATEGORIES, PROJECT_COLORS, roleLabel } from "../../lib/constants";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Card, CardHeader, Input, ListSkeleton, MultiSelect, Select, SwitchRow, Text } from "../../components/ui";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import { Button } from "../../components/ui/Button";
import type { RootStackParamList } from "../../navigation/types";

/** createProject/page.tsx and editProject/[projectId]/page.tsx (projectSchema / editProjectSchema). */
export function ProjectFormScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "ProjectForm">) {
    const projectId = route.params?.projectId;
    const { colors } = useTheme();
    const qc = useQueryClient();
    const { workspaceId, layout, permissions } = useWorkspace();
    const isManager = permissions?.workspaceRole === "MANAGER";

    const existing = useQuery({ queryKey: qk.project(projectId ?? ""), queryFn: () => projectsApi.get(projectId!), enabled: !!projectId });
    const members = useQuery({ queryKey: ["project-ws-members", workspaceId], queryFn: () => projectsApi.workspaceMembers(workspaceId), enabled: !!workspaceId });
    const clients = useQuery({ queryKey: ["clients", workspaceId], queryFn: () => projectsApi.clients(workspaceId), enabled: !!workspaceId });

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState<string | null>(null);
    const [color, setColor] = useState(PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]);
    const [projectManagerId, setProjectManagerId] = useState<string | null>(null);
    const [memberAccess, setMemberAccess] = useState<string[]>([]);
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [isInternal, setIsInternal] = useState(false);
    const [clintId, setClintId] = useState<string | null>(null);
    const [client, setClient] = useState({ companyName: "", registeredCompanyName: "", contactPerson: "", phoneNumber: "", gstNumber: "", directorName: "", address: "" });

    useEffect(() => {
        const p = existing.data;
        if (!p) return;
        setName(p.name ?? "");
        setDescription(p.description ?? "");
        setCategory(p.category ?? null);
        setColor(p.color ?? color);
        setProjectManagerId(p.projectManagerId ?? null);
        setMemberAccess(p.memberAccess ?? []);
        setTagIds(p.tagIds ?? []);
        setClient({
            companyName: p.companyName ?? "",
            registeredCompanyName: p.registeredCompanyName ?? "",
            contactPerson: p.contactPerson ?? "",
            phoneNumber: p.phoneNumber ?? "",
            gstNumber: p.gstNumber ?? "",
            directorName: p.directorName ?? "",
            address: p.address ?? "",
        });
    }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

    // A manager creating a project manages it themselves (createProject page).
    useEffect(() => {
        if (projectId || !isManager || projectManagerId || !members.data) return;
        const me = members.data.find((m: any) => m.userId === permissions?.userId);
        if (me) setProjectManagerId(me.id);
    }, [members.data, isManager, projectId, projectManagerId, permissions?.userId]);

    const memberOptions = useMemo(
        () => (members.data ?? []).map((m: any) => ({ value: m.id, label: m.surname || m.name || m.email, description: [m.designation, roleLabel(m.workspaceRole)].filter(Boolean).join(" · ") })),
        [members.data],
    );

    const save = useMutation({
        mutationFn: async () => {
            if (name.trim().length < 3) throw new Error("Name must be at least 3 characters long");
            if (description.trim().length < 3) throw new Error("Description must be at least 3 characters long");
            if (!category) throw new Error("Project type is required");
            if (!projectManagerId) throw new Error("Project manager is required");
            const clean = (v: string) => (v.trim() ? v.trim() : undefined);
            const body: ProjectInput = {
                name: name.trim(),
                description: description.trim(),
                category,
                color,
                projectManagerId,
                memberAccess: memberAccess.filter((id) => id !== projectManagerId),
                tagIds,
                workspaceId,
                isInternal,
                clintId: isInternal ? null : clintId,
                ...(isInternal || clintId
                    ? {}
                    : {
                          companyName: clean(client.companyName),
                          registeredCompanyName: clean(client.registeredCompanyName),
                          contactPerson: clean(client.contactPerson),
                          phoneNumber: clean(client.phoneNumber),
                          gstNumber: clean(client.gstNumber),
                          directorName: clean(client.directorName),
                          address: clean(client.address),
                      }),
            };
            return projectId ? projectsApi.update(projectId, body) : projectsApi.create(body);
        },
        onSuccess: (result: any) => {
            toast.success(projectId ? "Project updated successfully" : "Project created successfully");
            qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
            if (projectId) {
                qc.invalidateQueries({ queryKey: qk.project(projectId) });
                navigation.goBack();
            } else {
                const created = result?.data ?? result;
                navigation.goBack();
                if (created?.id) navigation.navigate("Project", { projectId: created.id, name: created.name });
            }
        },
        onError: (e) => toast.fromError(e),
    });

    if (projectId && existing.isLoading) {
        return (
            <Screen>
                <ScreenHeader title="Edit Project" back showActions={false} />
                <View style={{ padding: 16 }}>
                    <ListSkeleton rows={6} avatar={false} />
                </View>
            </Screen>
        );
    }

    return (
        <Screen>
            <ScreenHeader title={projectId ? "Edit Project" : "Create Project"} back showActions={false} />
            <ScreenBody
                footer={
                    <BottomBar>
                        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
                        <Button title={projectId ? "Save changes" : "Create Project"} style={{ flex: 1.4 }} loading={save.isPending} onPress={() => save.mutate()} />
                    </BottomBar>
                }
            >
                <Card padded={false}>
                    <CardHeader title="Project Details" />
                    <View style={{ padding: 16, gap: 14 }}>
                        <Input label="Project Name" required placeholder="Enter project name" value={name} onChangeText={setName} maxLength={100} />
                        <Input label="Description" required multiline placeholder="What is this project about?" value={description} onChangeText={setDescription} />
                        <Select label="Project Type" required value={category} onChange={setCategory} options={PROJECT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} placeholder="Select project type" />
                        <View style={{ gap: 8 }}>
                            <Text variant="overline" tone="muted">
                                Colour
                            </Text>
                            <View style={styles.colors}>
                                {PROJECT_COLORS.map((c) => (
                                    <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? colors.foreground : "transparent" }]}>
                                        {color === c ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Team Assignment" />
                    <View style={{ padding: 16, gap: 14 }}>
                        <Select
                            label="Project Manager"
                            required
                            value={projectManagerId}
                            onChange={(id) => {
                                setProjectManagerId(id);
                                if (id) setMemberAccess((current) => current.filter((m) => m !== id));
                            }}
                            options={memberOptions}
                            searchable
                            disabled={isManager && !projectId}
                            placeholder="Search managers…"
                        />
                        <MultiSelect label="Team Members" values={memberAccess} onChange={setMemberAccess} options={memberOptions.filter((o) => o.value !== projectManagerId)} searchable placeholder="Search members…" />
                        <MultiSelect label="Tags" values={tagIds} onChange={setTagIds} options={(layout?.tags ?? []).map((t) => ({ value: t.id, label: t.name }))} placeholder="Search workspace tags…" />
                    </View>
                </Card>

                <Card padded={false}>
                    <CardHeader title="Client" />
                    <View style={{ padding: 16, gap: 14 }}>
                        <SwitchRow label="Internal project" description="No external client" value={isInternal} onChange={(v) => { setIsInternal(v); if (v) setClintId(null); }} />
                        {!isInternal && (clients.data ?? []).length > 0 ? (
                            <Select
                                label="Existing client"
                                value={clintId}
                                onChange={setClintId}
                                allowClear
                                options={(clients.data ?? []).map((c: any) => ({ value: c.id, label: c.name ?? c.companyName, description: c.registeredCompanyName ?? undefined }))}
                                placeholder="Search existing clients…"
                            />
                        ) : null}
                        {!isInternal && !clintId ? (
                            <>
                                <Input label="Client Company Name" placeholder="e.g. Google" value={client.companyName} onChangeText={(companyName) => setClient((c) => ({ ...c, companyName }))} />
                                <Input label="Registered Company Name" placeholder="Full legal name" value={client.registeredCompanyName} onChangeText={(registeredCompanyName) => setClient((c) => ({ ...c, registeredCompanyName }))} />
                                <Input label="Contact Person" placeholder="Primary contact name" value={client.contactPerson} onChangeText={(contactPerson) => setClient((c) => ({ ...c, contactPerson }))} />
                                <Input label="Phone Number" placeholder="e.g. +91 98765 43210" keyboardType="phone-pad" value={client.phoneNumber} onChangeText={(phoneNumber) => setClient((c) => ({ ...c, phoneNumber }))} />
                                <Input label="GST Number" placeholder="12ABCDE3456F7Z8" autoCapitalize="characters" maxLength={15} value={client.gstNumber} onChangeText={(gstNumber) => setClient((c) => ({ ...c, gstNumber }))} />
                                <Input label="Director Name" placeholder="Authorized signatory" value={client.directorName} onChangeText={(directorName) => setClient((c) => ({ ...c, directorName }))} />
                                <Input label="Address" multiline placeholder="Full billing address" value={client.address} onChangeText={(address) => setClient((c) => ({ ...c, address }))} />
                            </>
                        ) : null}
                    </View>
                </Card>
            </ScreenBody>
        </Screen>
    );
}

const styles = StyleSheet.create({
    colors: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
});
