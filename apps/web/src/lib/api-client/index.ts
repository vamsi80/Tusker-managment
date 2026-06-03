import { tasksClient } from "@/lib/api-client/tasks";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { projectsClient } from "@/lib/api-client/projects";
import { authClient } from "@/lib/api-client/auth";
import { commentsClient } from "@/lib/api-client/comments";
import { reportsClient } from "@/lib/api-client/reports";
import { type ApiResponse } from "./types";

export { tasksClient, workspacesClient, projectsClient, commentsClient, reportsClient, type ApiResponse };

export const apiClient = {
    tasks: tasksClient,
    workspaces: workspacesClient,
    projects: projectsClient,
    auth: authClient,
    comments: commentsClient,
    reports: reportsClient,
};
