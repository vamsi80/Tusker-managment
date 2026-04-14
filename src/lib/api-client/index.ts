import { tasksClient } from "@/lib/api-client/tasks";
import { type ApiResponse } from "./types";

export { tasksClient, type ApiResponse };

export const apiClient = {
    tasks: tasksClient,
};
