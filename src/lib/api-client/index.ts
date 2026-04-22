import { tasksClient } from "@/lib/api-client/tasks";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { projectsClient } from "@/lib/api-client/projects";
import { authClient } from "@/lib/api-client/auth";
import { type ApiResponse } from "./types";

export { tasksClient, workspacesClient, projectsClient, type ApiResponse };

export const apiClient = {
    tasks: tasksClient,
    workspaces: workspacesClient,
    projects: projectsClient,
    auth: authClient,
};
