import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { isDemoMode } from "@/lib/config";
import { InterviewRequestSchema } from "@/lib/validation";
import {
  generateInterviewQuestion,
  evaluateInterviewAnswer,
  summarizeInterview,
} from "@/lib/interview";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

// Interview rate limiter: 150 AI calls / hour per user.
// A full 10-question session costs ~21 calls (10 questions + 10 evaluations + 1 summary).
const interviewRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(150, "1 h"),
  analytics: true,
  prefix: "@upstash/ratelimit/interview",
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limiting check (skipped in DEMO_MODE, mirroring /api/chat)
  if (!isDemoMode()) {
    try {
      const { success } = await interviewRateLimiter.limit(session.user.id);
      if (!success) {
        return NextResponse.json(
          { error: "Aide's free tier usage limit was reached — try again in a moment." },
          { status: 429 }
        );
      }
    } catch {
      // Fall through when Redis is offline
    }
  }

  // Zod input validation
  const body = await req.json().catch(() => ({}));
  const validation = InterviewRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
  }

  const data = validation.data;
  const config = {
    topic: data.topic,
    difficulty: data.difficulty,
    count: data.count,
  };

  try {
    switch (data.action) {
      case "start":
      case "next": {
        const question = await generateInterviewQuestion(
          config,
          data.questionNumber,
          data.previousQuestions ?? []
        );
        return NextResponse.json({ question });
      }

      case "evaluate": {
        const feedback = await evaluateInterviewAnswer(config, data.question, data.answer);
        return NextResponse.json({ feedback });
      }

      case "summary": {
        const summary = await summarizeInterview(config, data.turns);
        return NextResponse.json({ summary });
      }

      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (err: unknown) {
    const rawErr = err instanceof Error ? err.message : "An unexpected error occurred.";
    console.error("Interview API Error:", rawErr);

    let userFriendly =
      "Aide couldn't generate the next interview step — the AI service didn't respond.";
    if (rawErr.includes("429") || /rate limit|quota/i.test(rawErr)) {
      userFriendly = "Aide's free tier usage limit was reached — try again in a moment.";
    } else if (rawErr.includes("No LLM API key")) {
      userFriendly = "Aide couldn't run the interview — no AI API key configured.";
    }

    return NextResponse.json({ error: userFriendly }, { status: 502 });
  }
}