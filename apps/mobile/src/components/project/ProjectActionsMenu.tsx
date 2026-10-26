import { useNavigation } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, SlidersHorizontal, Trash2, Users } from "lucide-react-native";
import { projectsApi } from "../../api/projects";
import { useWorkspace } from "../../providers/WorkspaceProvider";
import { qk } from "../../lib/query";
import { toast } from "../../lib/toast";
import { ActionMenu, confirm } from "../ui";

/** nav-projects.tsx's per-project dropdown, as an action sheet. */
export function ProjectActionsMenu({ project, onClose }: { project: any | null; onClose: () => void }) {
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const { workspaceId } = useWorkspace();
    const remove = useMutation({
        mutationFn: (id: string) => projectsApi.remove(id),
        onSuccess: () => {
            toast.success("Project deleted successfully!");
            qc.invalidateQueries({ queryKey: qk.layout(workspaceId) });
        },
        onError: (e) => toast.fromError(e, "Failed to delete project"),
    });
    const manage = !!project?.canManageMembers;

    return (
        <ActionMenu
            open={!!project}
            onClose={onClose}
            title={project?.name}
            actions={
                project
                    ? [
                          { label: "View project", icon: Eye, onPress: () => navigation.navigate("Project", { projectId: project.id, name: project.name }) },
                          { label: "Edit project", icon: Pencil, hidden: !manage, onPress: () => navigation.navigate("ProjectForm", { projectId: project.id }) },
                          { label: "Manage members", icon: Users, hidden: !manage, onPress: () => navigation.navigate("ProjectSettings", { projectId: project.id }) },
                          { label: "Project settings", icon: SlidersHorizontal, hidden: !manage, onPress: () => navigation.navigate("ProjectSettings", { projectId: project.id }) },
                          {
                              label: "Delete project",
                              icon: Trash2,
                              destructive: true,
                              hidden: !manage,
                              onPress: async () => {
                                  const ok = await confirm({
                                      title: `Delete ${project.name}?`,
                                      message: "This permanently deletes the project and all of its tasks.",
                                      confirmLabel: "Delete",
                                      destructive: true,
                                  });
                                  if (ok) remove.mutate(project.id);
                              },
                          },
                      ]
                    : []
            }
        />
    );
}
