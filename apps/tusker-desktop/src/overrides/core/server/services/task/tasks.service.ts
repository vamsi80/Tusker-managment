/**
 * Desktop stand-in for packages/core/src/server/services/task/tasks.service.ts:
 * the website's server views call TasksService.getTasks(options, userId); the
 * API runs the same call with the same options for the session's user.
 */
import { api } from "../../../../web/lib/desktop-api";

export class TasksService {
    static getTasks(opts: Record<string, unknown>, _userId?: string) {
        return api<any>("/desktop/tasks", { body: opts });
    }
}
