import { db } from "./db";
import { Prisma } from "@prisma/client";

/**
 * Shared helper enforcing strict per-user data isolation.
 * Guarantees that all queries to User-owned resources (Conversation, Message, Memory)
 * are scoped by the authenticated user's ID.
 */
export function getScopedDb(userId: string) {
  if (!userId) {
    throw new Error("Unauthorized: userId must be provided for scoped database access.");
  }

  return {
    userId,

    // --- Conversations ---
    conversations: {
      findMany: (args?: Prisma.ConversationFindManyArgs) =>
        db.conversation.findMany({
          ...args,
          where: { ...args?.where, userId },
        }),
      findFirst: (args?: Prisma.ConversationFindFirstArgs) =>
        db.conversation.findFirst({
          ...args,
          where: { ...args?.where, userId },
        }),
      findUnique: async (id: string, includeMessages = false) => {
        return db.conversation.findFirst({
          where: { id, userId },
          include: includeMessages ? { messages: { orderBy: { createdAt: "asc" } } } : undefined,
        });
      },
      create: (data: Omit<Prisma.ConversationCreateInput, "user">) =>
        db.conversation.create({
          data: {
            ...data,
            user: { connect: { id: userId } },
          },
        }),
      update: (id: string, data: Prisma.ConversationUpdateInput) =>
        db.conversation.updateMany({
          where: { id, userId },
          data,
        }),
      delete: (id: string) =>
        db.conversation.deleteMany({
          where: { id, userId },
        }),
    },

    // --- Messages ---
    messages: {
      findMany: async (conversationId: string, args?: Prisma.MessageFindManyArgs) => {
        // Verify conversation belongs to user before reading messages
        const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } });
        if (!conv) return [];
        return db.message.findMany({
          ...args,
          where: { ...args?.where, conversationId },
        });
      },
      create: async (conversationId: string, data: Omit<Prisma.MessageUncheckedCreateInput, "conversationId">) => {
        const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } });
        if (!conv) {
          throw new Error("Forbidden: Cannot add message to a conversation owned by another user.");
        }
        return db.message.create({
          data: {
            ...data,
            conversationId,
          },
        });
      },
      deleteFrom: async (messageId: string) => {
        // Truncate: delete the message itself and every message after it in its
        // conversation (used by Regenerate and Edit-resubmit in the chat UI).
        const message = await db.message.findUnique({ where: { id: messageId } });
        if (!message) return { count: 0 };
        const conv = await db.conversation.findFirst({ where: { id: message.conversationId, userId } });
        if (!conv) {
          throw new Error("Forbidden: Cannot modify messages of a conversation owned by another user.");
        }
        return db.message.deleteMany({
          where: { conversationId: message.conversationId, createdAt: { gte: message.createdAt } },
        });
      },
    },

    // --- Memories ---
    memories: {
      findMany: (args?: Prisma.MemoryFindManyArgs) =>
        db.memory.findMany({
          ...args,
          where: { ...args?.where, userId },
        }),
      findFirst: (args?: Prisma.MemoryFindFirstArgs) =>
        db.memory.findFirst({
          ...args,
          where: { ...args?.where, userId },
        }),
      findUnique: async (id: string) => {
        return db.memory.findFirst({
          where: { id, userId },
        });
      },
      create: (data: Omit<Prisma.MemoryCreateInput, "user">) =>
        db.memory.create({
          data: {
            ...data,
            user: { connect: { id: userId } },
          },
        }),
      update: (id: string, data: Prisma.MemoryUpdateInput) =>
        db.memory.updateMany({
          where: { id, userId },
          data,
        }),
      delete: (id: string) =>
        db.memory.deleteMany({
          where: { id, userId },
        }),
    },
  };
}

// Retain legacy helpers for backward compatibility
export function scopedConversations(userId: string) {
  return getScopedDb(userId).conversations.findMany();
}

export function scopedMemories(userId: string) {
  return getScopedDb(userId).memories.findMany();
}
