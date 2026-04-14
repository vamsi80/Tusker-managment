import { tasksClient } from "@/lib/api-client/tasks";
import { workspacesClient } from "@/lib/api-client/workspaces";
import { type ApiResponse } from "./types";

export { tasksClient, workspacesClient, type ApiResponse };

export const apiClient = {
    tasks: tasksClient,
    workspaces: workspacesClient,
};
