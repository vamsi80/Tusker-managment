/**
 * Desktop stand-in for packages/core/src/server/services/leave/index.ts: the
 * LeaveService call the website's leaves page makes, answered by the API route
 * that runs it for the session's user.
 */
import { api } from "../../../../web/lib/desktop-api";

export class LeaveService {
    static getMemberBalances(workspaceId: string, _userId?: string) {
        return api<any>("/leaves/balance", { query: { workspaceId } });
    }
}
