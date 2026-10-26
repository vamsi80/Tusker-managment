import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { qk } from "../lib/query";
import { fallbackAccess, type ProjectAccess } from "../lib/taskRules";

/**
 * The caller's resolved permissions inside one project (GET /projects/:id/permissions):
 * project role flags, the permission matrix and the project's mandatory-evidence settings.
 */
export function useProjectAccess(projectId: string | null | undefined) {
    const { workspaceId, permissions } = useWorkspace();
    const query = useQuery({
        queryKey: qk.projectPermissions(workspaceId, projectId ?? ""),
        queryFn: () => projectsApi.permissions(workspaceId, projectId!),
        enabled: !!workspaceId && !!projectId,
        staleTime: 5 * 60_000,
    });

    const d = query.data;
    const access: ProjectAccess = d
        ? {
              isWorkspaceAdmin: !!d.isWorkspaceAdmin,
              isProjectManager: !!d.isProjectManager,
              isProjectCoordinator: !!d.isProjectCoordinator,
              isProjectLead: !!d.isProjectLead,
              userId: d.userId ?? null,
              projectMemberId: d.projectMember?.id ?? null,
              projectPermissions: d.projectPermissions ?? {},
              projectSettings: { mandatoryComment: !!d.projectSettings?.mandatoryComment, mandatoryAttachment: !!d.projectSettings?.mandatoryAttachment },
          }
        : fallbackAccess({
              isWorkspaceAdmin: !!permissions?.isWorkspaceAdmin,
              userId: permissions?.userId ?? null,
              role: projectId && permissions?.managedProjectIds?.includes(projectId) ? "PROJECT_MANAGER" : projectId && permissions?.leadProjectIds?.includes(projectId) ? "LEAD" : "MEMBER",
          });

    return { access, raw: d, isLoading: query.isLoading };
}
