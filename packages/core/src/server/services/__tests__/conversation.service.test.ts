import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ConversationService } = await import("../conversation/conversation.service");
const prisma = (await import("@tusker/db")).default;

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
      data: { deliveredAt: expect.any(Date) },
    }));
    expect(prisma.direct_message.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: { isRead: true, readAt: expect.any(Date) },
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
});
