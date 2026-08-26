import { tasksClient } from "./tasks";
import { workspacesClient } from "./workspaces";
import { projectsClient } from "./projects";
import { authClient } from "./auth";
import { commentsClient } from "./comments";
import { reportsClient } from "./reports";
import { procurementClient } from "./procurement";
import { type ApiResponse } from "./types";

export { tasksClient, workspacesClient, projectsClient, commentsClient, reportsClient, procurementClient, type ApiResponse };
export { apiFetch, ApiError, configureApiClient } from "./fetch-wrapper";

export const apiClient = {
    tasks: tasksClient,
    workspaces: workspacesClient,
    projects: projectsClient,
    auth: authClient,
    comments: commentsClient,
    reports: reportsClient,
    procurement: procurementClient,
};
