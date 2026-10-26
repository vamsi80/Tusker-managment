import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/push-notifications", () => ({
  sendPushNotification: vi.fn(async () => {}),
  sendSilentPush: vi.fn(async () => {}),
}));

const { ConversationService } = await import("../conversation/conversation.service");
const prisma = (await import("@tusker/db")).default;
const push = await import("../../../lib/push-notifications");

const participant = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  createdAt: new Date("2026-09-08T10:00:00Z"),
};

describe("ConversationService message controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T10:10:00Z"));
    (prisma.conversation.findFirst as any).mockResolvedValue(participant);
  });

  afterEach(() => vi.useRealTimers());

  it("marks received messages as delivered and hides only this user's deletions", async () => {
    (prisma.direct_message.findMany as any).mockResolvedValue([]);

    await ConversationService.getConversationMessages(
      "conversation-1",
      "viewer-1",
      50,
      undefined,
      "2026-09-08T10:00:00Z",
    );

    expect(prisma.direct_message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ senderId: { not: "viewer-1" }, deliveredAt: null }),
    }));
    expect(prisma.direct_message.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deletedFor: { none: { userId: "viewer-1" } },
        updatedAt: { gt: new Date("2026-09-08T10:00:00Z") },
      }),
    }));
  });

  it("allows the sender to edit during the ten-minute window", async () => {
    (prisma.direct_message.findFirst as any).mockResolvedValue({
      id: "message-1",
      senderId: "viewer-1",
      createdAt: new Date("2026-09-08T10:00:01Z"),
      isDeleted: false,
    });
    (prisma.direct_message.update as any).mockResolvedValue({ id: "message-1", content: "Updated" });

    await ConversationService.editMessage("conversation-1", "message-1", "viewer-1", " Updated ");

    expect(prisma.direct_message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "message-1" },
      data: expect.objectContaining({ content: "Updated", editedAt: expect.any(Date) }),
    }));
  });

  it("marks messages read without replacing an earlier delivery timestamp", async () => {
    await ConversationService.markAsRead("conversation-1", "viewer-1");

    expect(prisma.direct_message.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ deliveredAt: null, isDeleted: false }),
      data: expect.objectContaining({ deliveredAt: expect.any(Date), updatedAt: expect.any(Date) }),
    }));
    expect(prisma.direct_message.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ isRead: true, readAt: expect.any(Date), updatedAt: expect.any(Date) }),
    }));
  });

  it("rejects edits once ten minutes have passed", async () => {
    (prisma.direct_message.findFirst as any).mockResolvedValue({
      id: "message-1",
      senderId: "viewer-1",
      createdAt: new Date("2026-09-08T09:59:59Z"),
      isDeleted: false,
    });

    await expect(
      ConversationService.editMessage("conversation-1", "message-1", "viewer-1", "Too late")
    ).rejects.toThrow("Messages can only be edited within 10 minutes");
    expect(prisma.direct_message.update).not.toHaveBeenCalled();
  });

  it("stores delete-for-me without changing the shared message", async () => {
    (prisma.direct_message.findMany as any).mockResolvedValue([
      { id: "message-1", senderId: "other-user" },
      { id: "message-2", senderId: "viewer-1" },
    ]);

    await ConversationService.deleteMessages(
      "conversation-1",
      ["message-1", "message-2"],
      "viewer-1",
      "me",
    );

    expect(prisma.directMessageDeletion.createMany).toHaveBeenCalledWith({
      data: [
        { messageId: "message-1", userId: "viewer-1" },
        { messageId: "message-2", userId: "viewer-1" },
      ],
      skipDuplicates: true,
    });
    expect(prisma.direct_message.updateMany).not.toHaveBeenCalled();
  });

  it("rejects delete-for-everyone when any selected message belongs to someone else", async () => {
    (prisma.direct_message.findMany as any).mockResolvedValue([
      { id: "message-1", senderId: "viewer-1" },
      { id: "message-2", senderId: "other-user" },
    ]);

    await expect(ConversationService.deleteMessages(
      "conversation-1",
      ["message-1", "message-2"],
      "viewer-1",
      "everyone",
    )).rejects.toThrow("Delete for everyone is only available for messages you sent");
  });

  it("stamps updatedAt when deleting for everyone so real-time sync receives the update", async () => {
    (prisma.direct_message.findMany as any).mockResolvedValue([
      { id: "message-1", senderId: "viewer-1" },
    ]);
    (prisma.direct_message.findFirst as any).mockResolvedValue(null);

    await ConversationService.deleteMessages(
      "conversation-1",
      ["message-1"],
      "viewer-1",
      "everyone",
    );

    expect(prisma.direct_message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["message-1"] }, conversationId: "conversation-1" },
      data: expect.objectContaining({
        content: "",
        isDeleted: true,
        updatedAt: expect.any(Date),
        deletedAt: expect.any(Date),
      }),
    }));
  });

  it("resolves otherUser and stamps deliveredAt/updatedAt in getConversationMessages", async () => {
    (prisma.conversation.findFirst as any).mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
      createdAt: new Date("2026-09-08T10:00:00Z"),
      UserConversations: [
        { user: { id: "viewer-1", name: "Alice", surname: "Smith" } },
        { user: { id: "partner-2", name: "Bob", surname: "Jones" } },
      ],
    });
    (prisma.direct_message.findMany as any).mockResolvedValue([]);

    const result = await ConversationService.getConversationMessages(
      "conversation-1",
      "viewer-1",
    );

    expect(result.otherUser).toEqual(expect.objectContaining({ id: "partner-2", name: "Bob" }));
    expect(prisma.direct_message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        deliveredAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    }));
  });

  it("sends a message and notifies the recipient with WhatsApp-style DM payload", async () => {
    const auditModule = await import("../../../lib/audit");
    const recordSpy = vi.spyOn(auditModule, "recordActivity").mockResolvedValue({} as any);

    const fakeMessage = {
      id: "msg-1",
      content: "Hello Vamsi",
      senderId: "viewer-1",
      conversationId: "conversation-1",
      user: { id: "viewer-1", name: "Alice", surname: "Smith" },
    };

    (prisma.$transaction as any).mockImplementation(async (callback: any) => {
      const tx = {
        direct_message: { create: vi.fn().mockResolvedValue(fakeMessage) },
        conversation: { update: vi.fn().mockResolvedValue({}) },
        userConversations: {
          findFirst: vi.fn().mockResolvedValue({
            user: { id: "vamsi-id", lastActiveAt: new Date() },
          }),
        },
      };
      return callback(tx);
    });

    const sent = await ConversationService.sendMessage(
      "conversation-1",
      "viewer-1",
      "Hello Vamsi",
      "workspace-1",
    );

    expect(sent.content).toBe("Hello Vamsi");
    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({
      // The phone push is sent separately, only if still unread (pushIfUnread).
      skipPush: true,
      userId: "viewer-1",
      userName: "Smith",
      action: "DM_MESSAGE",
      entityType: "CONVERSATION",
      entityId: "conversation-1",
      newData: expect.objectContaining({
        content: "Hello Vamsi",
        conversationId: "conversation-1",
      }),
      targetUserIds: ["vamsi-id"],
    }));
  });
});

describe("DM phone notifications follow what was read elsewhere", () => {
  const dm = {
    messageId: "msg-1",
    recipientId: "vamsi-id",
    senderId: "viewer-1",
    senderName: "Alice",
    content: "Are you on site?",
    conversationId: "conversation-1",
    workspaceId: "workspace-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (prisma.conversation.findFirst as any).mockResolvedValue(participant);
    (prisma as any).notification = { updateMany: vi.fn(async () => ({ count: 1 })) };
  });

  afterEach(() => vi.useRealTimers());

  /** Runs pushIfUnread through its delay. */
  const runPush = async () => {
    const done = ConversationService.pushIfUnread(dm);
    await vi.advanceTimersByTimeAsync(6_000);
    await done;
  };

  it("pushes WhatsApp-style if the message is still unread after the delay", async () => {
    (prisma.direct_message.findUnique as any).mockResolvedValue({ isRead: false, isDeleted: false });
    await runPush();
    expect(push.sendPushNotification).toHaveBeenCalledWith(
      ["vamsi-id"],
      "Alice",
      "Are you on site?",
      expect.objectContaining({ type: "direct_message", conversationId: "conversation-1", workspaceId: "workspace-1" }),
      expect.objectContaining({ categoryId: "direct_message" }),
    );
    // Android drops a push naming a channel the phone doesn't have, so DMs
    // must not name one (older installs only have "default").
    const extra = (push.sendPushNotification as any).mock.calls[0][4];
    expect(extra).not.toHaveProperty("channelId");
  });

  it("stays quiet when it was read in the meantime, e.g. on the web", async () => {
    (prisma.direct_message.findUnique as any).mockResolvedValue({ isRead: true, isDeleted: false });
    await runPush();
    expect(push.sendPushNotification).not.toHaveBeenCalled();
  });

  it("stays quiet for a message deleted before the push", async () => {
    (prisma.direct_message.findUnique as any).mockResolvedValue({ isRead: false, isDeleted: true });
    await runPush();
    expect(push.sendPushNotification).not.toHaveBeenCalled();
  });

  it("reading a chat marks its notifications read and clears them from the phone", async () => {
    (prisma.direct_message.updateMany as any)
      .mockResolvedValueOnce({ count: 0 }) // delivered stamps
      .mockResolvedValueOnce({ count: 2 }); // newly read
    const tasks: Promise<unknown>[] = [];
    await ConversationService.markAsRead("conversation-1", "viewer-1", (task) => tasks.push(task));
    await Promise.all(tasks);

    expect((prisma as any).notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "viewer-1", type: "DM_MESSAGE", entityId: "conversation-1", isRead: false },
      data: { isRead: true },
    });
    expect(push.sendSilentPush).toHaveBeenCalledWith(["viewer-1"], { type: "dm_read", conversationId: "conversation-1" });
  });

  it("opening an already-read chat sends nothing", async () => {
    const tasks: Promise<unknown>[] = [];
    await ConversationService.markAsRead("conversation-1", "viewer-1", (task) => tasks.push(task));
    expect(tasks).toHaveLength(0);
    expect(push.sendSilentPush).not.toHaveBeenCalled();
  });
});
