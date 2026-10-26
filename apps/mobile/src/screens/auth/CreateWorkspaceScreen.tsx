import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { workspacesApi } from "../../api/workspaces";
import { useAuth } from "../../providers/AuthProvider";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { Button, Input } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/types";
import { AuthLayout } from "./AuthLayout";

/** slugify(name, { lower: true, strict: true }) as the web form does. */
const slugify = (value: string) =>
    value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

/** (auth)/create-workspace — workSpaceSchema: name, slug, description (3+ chars). */
export function CreateWorkspaceScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "CreateWorkspace">) {
    const qc = useQueryClient();
    const auth = useAuth();
    const { switchWorkspace, workspaces } = useWorkspace();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (name.trim().length < 3) return toast.error("Name must be at least 3 characters long");
        if (description.trim().length < 3) return toast.error("Description must be at least 3 characters long");
        setLoading(true);
        try {
            const created: any = await workspacesApi.create({ name: name.trim(), slug: slugify(name), description: description.trim() });
            toast.success("Workspace created");
            await qc.invalidateQueries({ queryKey: qk.workspaces() });
            if (created?.id) switchWorkspace(created.id);
            if (navigation.canGoBack()) navigation.goBack();
        } catch (error) {
            toast.fromError(error, "Failed to create workspace");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="Create a workspace" description="A workspace holds your projects, team, procurement and attendance.">
            <Input label="Workspace name" placeholder="Title" value={name} onChangeText={setName} />
            <Input label="Description" placeholder="Small Description" multiline value={description} onChangeText={setDescription} />
            <Button title="Create workspace" size="lg" loading={loading} onPress={submit} />
            {workspaces.length === 0 ? <Button title="Log out" variant="ghost" onPress={() => auth.signOut()} /> : null}
        </AuthLayout>
    );
}
