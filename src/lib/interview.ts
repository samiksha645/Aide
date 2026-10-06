import { isDemoMode } from "@/lib/config";

/**
 * Interview Mode — shared types, prompt builders, response parsers and the
 * provider-agnostic LLM calls behind GET /api/interview.
 *
 * Everything in this module is server-free apart from the async helpers at the
 * bottom, so the pure pieces (prompts + parsers + scoring) can be unit tested
 * directly and reused by the API route.
 */

/* ------------------------------------------------------------------ *
 * Types & constants
 * ------------------------------------------------------------------ */

export type InterviewDifficulty = "Beginner" | "Intermediate" | "Advanced";

export const INTERVIEW_DIFFICULTIES: InterviewDifficulty[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

/** Number-of-questions choices offered on the setup screen. */
export const INTERVIEW_QUESTION_COUNTS = [3, 5, 10] as const;

export type InterviewQuestionCount = (typeof INTERVIEW_QUESTION_COUNTS)[number];

export interface InterviewConfig {
  topic: string;
  difficulty: InterviewDifficulty;
  count: number;
}

export interface InterviewFeedback {
  /** Score out of 10 (integer). */
  score: number;
  /** Short phrases describing what the candidate got right. */
  correct: string[];
  /** Short phrases describing what was missing or wrong. */
  missing: string[];
  /** One specific, actionable improvement tip. */
  improvement: string;
}

export interface InterviewTurn {
  question: string;
  answer: string;
  feedback: InterviewFeedback;
}

export interface InterviewSummary {
  /** Overall score out of 10 (one decimal allowed). */
  overallScore: number;
  strongestArea: string;
  areaToImprove: string;
  /** Short encouraging closing note. */
  note: string;
}

/* ------------------------------------------------------------------ *
 * Validation helpers (also used by the zod schema in the API route)
 * ------------------------------------------------------------------ */

export function isInterviewDifficulty(value: unknown): value is InterviewDifficulty {
  return typeof value === "string" && (INTERVIEW_DIFFICULTIES as string[]).includes(value);
}

export function isInterviewQuestionCount(value: unknown): value is InterviewQuestionCount {
  return (
    typeof value === "number" &&
    (INTERVIEW_QUESTION_COUNTS as readonly number[]).includes(value)
  );
}

/* ------------------------------------------------------------------ *
 * Prompt builders
 * ------------------------------------------------------------------ */

const DIFFICULTY_GUIDANCE: Record<InterviewDifficulty, string> = {
  Beginner: "foundational, definition-level questions for someone new to the topic",
  Intermediate: "applied questions that need practical understanding and some experience",
  Advanced: "deep, scenario-based questions that probe edge cases and trade-offs",
};

export function buildQuestionPrompt(
  config: InterviewConfig,
  questionNumber: number,
  previousQuestions: string[] = []
): string {
  const asked = previousQuestions.filter((q) => q.trim().length > 0);
  const avoid = asked.length
    ? `\nNever repeat or rephrase any of these already-asked questions:\n${asked
        .map((q) => `- ${q}`)
        .join("\n")}`
    : "";

  return `You are an expert interviewer running a mock interview.
Topic: "${config.topic}"
Difficulty: ${config.difficulty} (${DIFFICULTY_GUIDANCE[config.difficulty]})
This is question ${questionNumber} of ${config.count}.${avoid}

Write ONE clear, self-contained interview question. Do not number it, do not reveal the answer, and add no commentary.
Respond with the question text only.`;
}

export function buildEvaluationPrompt(
  config: InterviewConfig,
  question: string,
  answer: string
): string {
  return `You are an expert interviewer grading a candidate's spoken answer.

Topic: ${config.topic}
Difficulty: ${config.difficulty}
Question: ${question}
Candidate's answer: ${answer.trim() || "(the candidate left this blank)"}

Evaluate the answer and respond with ONLY a JSON object in exactly this shape:
{
  "score": <integer from 0 to 10>,
  "correct": ["short phrase describing something the candidate got right"],
  "missing": ["short phrase describing something missing or wrong"],
  "improvement": "one specific, actionable improvement tip"
}
Use 1-4 items in each array. No markdown and no commentary outside the JSON.`;
}

export function buildSummaryPrompt(config: InterviewConfig, turns: InterviewTurn[]): string {
  const transcript = turns
    .map((t, i) =>
      [
        `Q${i + 1}: ${t.question}`,
        `Answer: ${t.answer || "(blank)"}`,
        `Score: ${t.feedback.score}/10`,
        `Correct: ${t.feedback.correct.join("; ") || "none noted"}`,
        `Missing: ${t.feedback.missing.join("; ") || "none noted"}`,
      ].join("\n")
    )
    .join("\n\n");

  return `You are an expert interviewer summarising a completed mock interview.

Topic: ${config.topic}
Difficulty: ${config.difficulty}
Questions answered: ${turns.length}
Average score: ${averageScore(turns)}/10

Transcript:
${transcript}

Respond with ONLY a JSON object in exactly this shape:
{
  "overallScore": <number from 0 to 10, one decimal allowed>,
  "strongestArea": "the sub-topic or skill the candidate handled best",
  "areaToImprove": "the single most important sub-topic or skill to work on",
  "note": "one short encouraging sentence"
}
No markdown and no commentary outside the JSON.`;
}

/* ------------------------------------------------------------------ *
 * Response parsing (defensive — models sometimes wrap JSON in prose)
 * ------------------------------------------------------------------ */

/** Remove markdown code fences wrapping the whole reply. */
function stripCodeFence(raw: string): string {
  const text = (raw || "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}

/** Best-effort JSON object extraction from a model reply. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = stripCodeFence(raw);
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : String(v ?? "").trim()))
      .filter((v) => v.length > 0);
  }
  const single = asTrimmedString(value);
  return single ? [single] : [];
}

/** Clamp to a whole number in [0, 10] for per-question scores. */
function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, Math.round(n)));
}

/** Clamp to [0, 10] keeping a single decimal (for the overall score). */
function clampScoreDecimal(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
}

/** Normalise a generated question (strip numbering, fences, wrapping quotes). */
export function parseQuestion(raw: string): string {
  const text = stripCodeFence(raw)
    .replace(/^\s*(?:q(?:uestion)?\s*\d+\s*[:.)-]\s*)/i, "")
    .trim();
  const unquoted = text.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  return unquoted || text;
}

/** Parse the evaluation reply into a fully-populated feedback object. */
export function parseFeedback(raw: string): InterviewFeedback {
  const obj = extractJsonObject(raw) ?? {};
  const correct = asStringArray(obj.correct);
  const missing = asStringArray(obj.missing);

  return {
    score: clampScore(obj.score),
    correct: correct.length ? correct : ["No clearly correct points were identified in the answer."],
    missing: missing.length ? missing : ["The answer could be expanded with more concrete detail."],
    improvement:
      asTrimmedString(obj.improvement) || "Add a specific example to support your answer.",
  };
}

/** Mean per-question score (0–10, one decimal). */
export function averageScore(turns: InterviewTurn[]): number {
  if (!turns.length) return 0;
  const total = turns.reduce((sum, t) => sum + t.feedback.score, 0);
  return Math.round((total / turns.length) * 10) / 10;
}

/** Parse the closing summary, falling back to the computed average score. */
export function parseSummary(raw: string, turns: InterviewTurn[]): InterviewSummary {
  const obj = extractJsonObject(raw) ?? {};
  const hasScore = obj.overallScore !== undefined && obj.overallScore !== null;

  return {
    overallScore: hasScore ? clampScoreDecimal(obj.overallScore) : averageScore(turns),
    strongestArea:
      asTrimmedString(obj.strongestArea) || "Your clearest, most specific answers.",
    areaToImprove:
      asTrimmedString(obj.areaToImprove) || "Add depth and concrete examples to your answers.",
    note:
      asTrimmedString(obj.note) ||
      "Consistent practice is what turns knowledge into interview performance — keep going!",
  };
}

/* ------------------------------------------------------------------ *
 * LLM calls (Gemini → Anthropic → OpenAI → demo mock)
 * ------------------------------------------------------------------ */

const MODEL_ID = "gemini-3.6-flash";

/**
 * Output budget shared by every interview call. gemini-3.6-flash is a
 * *thinking* model: its hidden reasoning is billed against the output budget,
 * so a small limit leaves the visible reply empty or cut off mid-sentence.
 * 2048 mirrors the limit already used by /api/chat.
 */
const MAX_OUTPUT_TOKENS = 2048;

/** Transient provider hiccups worth retrying (this model runs in high demand). */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST JSON to a provider and decode the reply, retrying the transient
 * capacity errors that the Gemini endpoint returns under load.
 */
async function postJson(
  url: string,
  init: RequestInit,
  provider: string,
  attempts = 3
): Promise<unknown> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt === attempts) throw err;
      await sleep(400 * attempt);
      continue;
    }

    if (res.ok) return res.json();

    lastStatus = res.status;
    if (!isRetryableStatus(res.status) || attempt === attempts) break;
    await sleep(400 * attempt);
  }

  throw new Error(`${provider} API Error (${lastStatus})`);
}

async function callModel(prompt: string, jsonMode = false): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.6,
      // Skip the hidden reasoning pass so the whole budget goes to the reply.
      thinkingConfig: { thinkingBudget: 0 },
    };
    if (jsonMode) generationConfig.responseMimeType = "application/json";

    const data = (await postJson(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig,
        }),
      },
      "Gemini"
    )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };

    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const data = (await postJson(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [{ role: "user", content: prompt }],
        }),
      },
      "Anthropic"
    )) as { content?: { text?: string }[] };

    return data.content?.[0]?.text?.trim() || "";
  }

  if (process.env.OPENAI_API_KEY) {
    const data = (await postJson(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: MAX_OUTPUT_TOKENS,
        }),
      },
      "OpenAI"
    )) as { choices?: { message?: { content?: string } }[] };

    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  throw new Error(
    "No LLM API key configured. Set GEMINI_API_KEY (recommended, free), ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env.local — or set DEMO_MODE=true."
  );
}

/* ---------------------------- demo mocks ---------------------------- */

function demoQuestion(config: InterviewConfig, questionNumber: number): string {
  return `(${config.difficulty}) ${config.topic} — sample question ${questionNumber}: Explain a core concept of ${config.topic} and describe a real situation where you would use it.`;
}

function demoFeedback(config: InterviewConfig, answer: string): InterviewFeedback {
  const hasAnswer = answer.trim().length > 0;
  return {
    score: hasAnswer ? 6 : 0,
    correct: hasAnswer
      ? [`You addressed ${config.topic} directly.`]
      : [],
    missing: hasAnswer
      ? ["A concrete example that shows the concept in action."]
      : ["Any answer at all — even a partial one helps you improve."],
    improvement: `Name one specific tool, trade-off, or example related to ${config.topic}.`,
  };
}

function demoSummary(config: InterviewConfig, turns: InterviewTurn[]): InterviewSummary {
  return {
    overallScore: averageScore(turns),
    strongestArea: `Your clearest explanations of ${config.topic}.`,
    areaToImprove: "Supporting every answer with a concrete example.",
    note: `Good effort completing all ${turns.length} questions — keep practising ${config.topic}.`,
  };
}

/* ---------------------------- public API ---------------------------- */

export async function generateInterviewQuestion(
  config: InterviewConfig,
  questionNumber: number,
  previousQuestions: string[] = []
): Promise<string> {
  if (isDemoMode()) return demoQuestion(config, questionNumber);

  const raw = await callModel(buildQuestionPrompt(config, questionNumber, previousQuestions));
  const question = parseQuestion(raw);
  return question || demoQuestion(config, questionNumber);
}

export async function evaluateInterviewAnswer(
  config: InterviewConfig,
  question: string,
  answer: string
): Promise<InterviewFeedback> {
  if (isDemoMode()) return demoFeedback(config, answer);

  // jsonMode: grading must come back as a parseable JSON object.
  const raw = await callModel(buildEvaluationPrompt(config, question, answer), true);
  return parseFeedback(raw);
}

export async function summarizeInterview(
  config: InterviewConfig,
  turns: InterviewTurn[]
): Promise<InterviewSummary> {
  if (isDemoMode()) return demoSummary(config, turns);

  const raw = await callModel(buildSummaryPrompt(config, turns), true);
  return parseSummary(raw, turns);
}