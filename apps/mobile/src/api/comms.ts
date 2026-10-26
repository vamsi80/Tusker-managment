import { api, request, type ApiError } from "./client";

/** Messages, notifications, personal space and the activity feed. */

export const conversationsApi = {
    list: (workspaceId: string) => api.get<any[]>(`/conversations/${workspaceId}`),
    members: (workspaceId: string) => api.get<any[]>(`/conversations/${workspaceId}/members`),
    open: (workspaceId: string, recipientId: string) => api.post<any>(`/conversations/${workspaceId}`, { recipientId }),
    messages: async (workspaceId: string, conversationId: string, p: { cursor?: string | null; since?: string; limit?: number } = {}) => {
        const body = await request<any>(`/conversations/${workspaceId}/${conversationId}/messages`, {
            query: { cursor: p.cursor ?? undefined, since: p.since, limit: p.limit ?? 40 },
        });
        return { messages: (body.data ?? []) as any[], hasMore: !!body.hasMore, nextCursor: (body.nextCursor ?? null) as string | null };
    },
    send: (workspaceId: string, conversationId: string, content: string) =>
        api.post<any>(`/conversations/${workspaceId}/${conversationId}/messages`, { content }),
    markRead: (workspaceId: string, conversationId: string) =>
        request(`/conversations/${workspaceId}/${conversationId}/read`, { method: "PATCH", body: {} }),
    edit: (workspaceId: string, conversationId: string, messageId: string, content: string) =>
        api.patch(`/conversations/${workspaceId}/${conversationId}/messages/${messageId}`, { content }),
    remove: (workspaceId: string, conversationId: string, messageIds: string[], scope: "me" | "everyone") =>
        api.post(`/conversations/${workspaceId}/${conversationId}/messages/delete`, { messageIds, scope }),
    forward: (workspaceId: string, conversationId: string, messageIds: string[], targetConversationIds: string[]) =>
        api.post(`/conversations/${workspaceId}/${conversationId}/messages/forward`, { messageIds, targetConversationIds }),
    typing: (conversationId: string, isTyping: boolean) =>
        request(`/conversations/${conversationId}/typing`, { method: "POST", body: { isTyping } }).catch(() => {}),
};

export type NotificationGroup = {
    id?: string;
    taskId: string;
    taskName: string;
    taskSlug?: string | null;
    projectName: string;
    parentTaskName?: string | null;
    type: string;
    entityType?: string | null;
    entityId?: string | null;
    conversationId?: string;
    latestComment: { content: string; createdAt: string; user: { name?: string; surname?: string | null; image?: string | null } };
    count: number;
    isNew: boolean;
};

/**
 * The web's notification centre (notifications-context.tsx): comments,
 * subtask activity and direct notifications grouped per task, read through
 * the comments route.
 */
export const notificationsApi = {
    list: (workspaceId: string, cursor?: string | null, limit = 15) =>
        api.get<{ unreadNotifications: NotificationGroup[]; readNotifications: NotificationGroup[]; peopleCount: number; nextCursor: string | null; hasMore: boolean }>(
            `/comments/notifications/${workspaceId}`,
            { limit, cursor: cursor ?? undefined },
        ),
    /** Takes the group's id (direct notifications) or its taskId (comment threads). */
    markRead: (targetId: string) => request(`/comments/task/${targetId}/read`, { method: "POST", body: {} }),
    markAllRead: (workspaceId: string) => request(`/comments/notifications/${workspaceId}/mark-all-read`, { method: "POST", body: {} }),
};

export const myspaceApi = {
    /** Personal to-dos (member-todos route — the web's My Space > To-do). */
    todos: (workspaceId: string) => api.get<any[]>(`/member-todos/${workspaceId}`),
    addTodo: (workspaceId: string, text: string) => api.post(`/member-todos/${workspaceId}`, { text }),
    editTodo: (workspaceId: string, id: string, text: string) => api.put(`/member-todos/${workspaceId}/${id}`, { text }),
    toggleTodo: (workspaceId: string, id: string) => api.patch(`/member-todos/${workspaceId}/${id}`, {}),
    reorderTodos: (workspaceId: string, todoIds: string[]) => api.patch(`/member-todos/${workspaceId}/reorder`, { todoIds }),
    deleteTodo: (workspaceId: string, id: string) => api.del(`/member-todos/${workspaceId}/${id}`),

    /** Member board (web /my-board): notes handed to members, Done / Not done. */
    board: (workspaceId: string) => api.get<any>("/board", { workspaceId }),
    addBoardItem: (workspaceId: string, memberId: string, note: string) => api.post("/board", { workspaceId, memberId, note }),
    /** The route flips the status it is given, so pass the note's current status. */
    toggleBoardItem: (workspaceId: string, itemId: string, currentStatus: "DONE" | "NOT_DONE") =>
        api.patch(`/board/${itemId}`, { workspaceId, status: currentStatus }),
    deleteBoardItem: (workspaceId: string, itemId: string) => api.del(`/board/${itemId}`, undefined, { workspaceId }),
};

export const activityApi = {
    feed: async (workspaceId: string, projectId?: string) => {
        const body = await request<any>("/activities", { query: { workspaceId, projectId } });
        return (body.activities ?? body.data ?? []) as any[];
    },
};

export const userApi = {
    profile: () => request<{ user: any; stats: any }>("/user/profile"),
    updateProfile: (body: { name?: string; surname?: string; phoneNumber?: string; image?: string }) =>
        request("/user/profile", { method: "PATCH", body }),
    registerPushToken: (pushToken: string) => request("/user/push-token", { method: "POST", body: { pushToken } }),
};

export const presenceApi = {
    heartbeat: (workspaceId: string) => request(`/presence/${workspaceId}`, { method: "POST", body: {} }).catch(() => {}),
};

export const uploadsApi = {
    presign: (input: { workspaceId: string; projectId: string; taskId: string; name: string; mime: string; size: number }) =>
        api.post<{ url: string; key: string; contentType: string }>("/uploads/presign", input),
};

/** Travis — the in-app AI agent (apps/api/src/hono/routes/ai.ts). */
export type TravisTurn = { success: boolean; conversationId?: string; events: any[]; message?: string };

/**
 * Travis answers failures (rate limit, timeout, provider down) with the same
 * event envelope and an error status, so a failed call still yields events.
 */
async function travisCall(path: string, body: unknown, signal?: AbortSignal): Promise<TravisTurn> {
    try {
        return await request<TravisTurn>(path, { method: "POST", body, signal });
    } catch (error) {
        const payload = (error as ApiError)?.body as TravisTurn | undefined;
        if (payload && Array.isArray(payload.events) && payload.events.length) return payload;
        const status = (error as ApiError)?.status;
        const [code, message] =
            status === 429
                ? ["rate_limited", "You're sending messages too fast. Please wait a moment."]
                : status === 504
                  ? ["timeout", "Travis is taking too long to respond. Please try again."]
                  : status === 503
                    ? ["provider_unavailable", "Travis is temporarily unavailable. Please try again shortly."]
                    : ["internal", (error as Error)?.message || "Failed to reach Travis."];
        return { success: false, events: [{ type: "error", code, message }], message };
    }
}

export const travisApi = {
    chat: (
        body: {
            workspaceId: string;
            message: string;
            conversationId?: string;
            currentScreen?: string;
            selectedProjectId?: string;
            selectedTaskId?: string;
            timezone?: string;
            locale?: string;
            clientRequestId?: string;
            history?: { role: "user" | "assistant"; content: string }[];
        },
        signal?: AbortSignal,
    ) => travisCall("/ai/chat", body, signal),
    confirm: (confirmationToken: string, clientRequestId?: string, signal?: AbortSignal) =>
        travisCall("/ai/confirm", { confirmationToken, clientRequestId }, signal),
    conversations: (workspaceId: string, cursor?: string) =>
        request<{ conversations: { id: string; title?: string | null; updatedAt: string }[]; hasMore: boolean; nextCursor: string | null }>("/ai/conversations", {
            query: { workspaceId, cursor },
        }),
    messages: (workspaceId: string, id: string) =>
        request<{ messages: { id: string; role: string; content: string; entityRefs?: any; confirmationState?: string | null; createdAt: string }[] }>(
            `/ai/conversations/${id}/messages`,
            { query: { workspaceId } },
        ),
};
