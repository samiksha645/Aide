import { z } from "zod";
import {
  INTERVIEW_DIFFICULTIES,
  isInterviewQuestionCount,
  type InterviewDifficulty,
} from "@/lib/interview";

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

/* ----------------------------- Interview Mode ----------------------------- */

const InterviewConfigShape = {
  topic: z.string().min(1, "topic is required").max(200, "topic is too long"),
  difficulty: z.enum(INTERVIEW_DIFFICULTIES as [InterviewDifficulty, ...InterviewDifficulty[]]),
  count: z
    .number()
    .int("count must be a whole number")
    .refine(isInterviewQuestionCount, { message: "count must be 3, 5 or 10" }),
};

export const InterviewFeedbackSchema = z.object({
  score: z.number().min(0).max(10),
  correct: z.array(z.string()),
  missing: z.array(z.string()),
  improvement: z.string(),
});

export const InterviewTurnSchema = z.object({
  question: z.string().max(2000),
  answer: z.string().max(10000),
  feedback: InterviewFeedbackSchema,
});

/** POST /api/interview — one request per interview step. */
export const InterviewRequestSchema = z.discriminatedUnion("action", [
  z.object({
    ...InterviewConfigShape,
    action: z.literal("start"),
    questionNumber: z.number().int().min(1).max(10),
    previousQuestions: z.array(z.string().max(2000)).max(20).optional(),
  }),
  z.object({
    ...InterviewConfigShape,
    action: z.literal("next"),
    questionNumber: z.number().int().min(1).max(10),
    previousQuestions: z.array(z.string().max(2000)).max(20).optional(),
  }),
  z.object({
    ...InterviewConfigShape,
    action: z.literal("evaluate"),
    question: z.string().min(1, "question is required").max(2000),
    answer: z.string().max(10000, "answer is too long"),
  }),
  z.object({
    ...InterviewConfigShape,
    action: z.literal("summary"),
    turns: z.array(InterviewTurnSchema).min(1, "at least one turn is required").max(10),
  }),
]);
