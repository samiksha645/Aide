import { z } from "zod";

export const ChatInputSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
  message: z.string().min(1, "message cannot be empty").max(10000, "message is too long"),
});

export const CreateConversationSchema = z.object({
  title: z.string().max(100, "title is too long").optional(),
});

export const UpdateConversationSchema = z.object({
  title: z.string().min(1, "title cannot be empty").max(100, "title is too long"),
});

export const MemoryDeleteSchema = z.object({
  id: z.string().min(1, "memory id is required"),
});
