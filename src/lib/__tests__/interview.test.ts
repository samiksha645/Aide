import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_QUESTION_COUNTS,
  averageScore,
  buildEvaluationPrompt,
  buildQuestionPrompt,
  buildSummaryPrompt,
  evaluateInterviewAnswer,
  generateInterviewQuestion,
  isInterviewDifficulty,
  isInterviewQuestionCount,
  parseFeedback,
  parseQuestion,
  parseSummary,
  summarizeInterview,
  type InterviewConfig,
  type InterviewTurn,
} from "@/lib/interview";

const CONFIG: InterviewConfig = {
  topic: "JavaScript",
  difficulty: "Intermediate",
  count: 5,
};

function makeTurn(score: number, question = "Q", answer = "A"): InterviewTurn {
  return {
    question,
    answer,
    feedback: { score, correct: [], missing: [], improvement: "" },
  };
}

describe("interview constants & guards", () => {
  it("offers the expected difficulty levels and question counts", () => {
    expect(INTERVIEW_DIFFICULTIES).toEqual(["Beginner", "Intermediate", "Advanced"]);
    expect([...INTERVIEW_QUESTION_COUNTS]).toEqual([3, 5, 10]);
  });

  it("validates difficulty values", () => {
    expect(isInterviewDifficulty("Beginner")).toBe(true);
    expect(isInterviewDifficulty("Advanced")).toBe(true);
    expect(isInterviewDifficulty("Expert")).toBe(false);
    expect(isInterviewDifficulty(undefined)).toBe(false);
  });

  it("only allows 3, 5 or 10 questions", () => {
    expect(isInterviewQuestionCount(3)).toBe(true);
    expect(isInterviewQuestionCount(5)).toBe(true);
    expect(isInterviewQuestionCount(10)).toBe(true);
    expect(isInterviewQuestionCount(7)).toBe(false);
    expect(isInterviewQuestionCount("5")).toBe(false);
  });
});

describe("buildQuestionPrompt", () => {
  it("embeds the topic, difficulty and progress", () => {
    const prompt = buildQuestionPrompt(CONFIG, 2);
    expect(prompt).toContain('"JavaScript"');
    expect(prompt).toContain("Intermediate");
    expect(prompt).toContain("question 2 of 5");
  });

  it("lists previously asked questions to avoid repeats", () => {
    const prompt = buildQuestionPrompt(CONFIG, 3, ["What is a closure?"]);
    expect(prompt).toContain("Never repeat");
    expect(prompt).toContain("- What is a closure?");
  });

  it("omits the avoid-list when there is no history", () => {
    expect(buildQuestionPrompt(CONFIG, 1, [])).not.toContain("Never repeat");
  });
});

describe("buildEvaluationPrompt", () => {
  it("includes the question and the candidate's answer", () => {
    const prompt = buildEvaluationPrompt(CONFIG, "What is a closure?", "A function bundle");
    expect(prompt).toContain("What is a closure?");
    expect(prompt).toContain("A function bundle");
    expect(prompt).toContain('"score"');
  });

  it("flags blank answers", () => {
    expect(buildEvaluationPrompt(CONFIG, "Q", "   ")).toContain("(the candidate left this blank)");
  });
});

describe("buildSummaryPrompt", () => {
  it("includes the transcript and the computed average", () => {
    const prompt = buildSummaryPrompt(CONFIG, [makeTurn(8, "Q1"), makeTurn(6, "Q2")]);
    expect(prompt).toContain("Average score: 7/10");
    expect(prompt).toContain("Q1");
    expect(prompt).toContain("Q2");
    expect(prompt).toContain("strongestArea");
  });
});

describe("parseQuestion", () => {
  it("strips question numbering", () => {
    expect(parseQuestion("Q1. What is a closure?")).toBe("What is a closure?");
    expect(parseQuestion("Question 2: Explain hoisting")).toBe("Explain hoisting");
  });

  it("strips markdown fences and wrapping quotes", () => {
    expect(parseQuestion('```\n"What is a promise?"\n```')).toBe("What is a promise?");
  });

  it("leaves a plain question untouched", () => {
    expect(parseQuestion("Explain the event loop")).toBe("Explain the event loop");
  });
});

describe("parseFeedback", () => {
  it("parses a well-formed JSON reply", () => {
    const fb = parseFeedback(
      '{"score": 7, "correct": ["Mentioned scope"], "missing": ["No examples"], "improvement": "Add an example"}'
    );
    expect(fb.score).toBe(7);
    expect(fb.correct).toEqual(["Mentioned scope"]);
    expect(fb.missing).toEqual(["No examples"]);
    expect(fb.improvement).toBe("Add an example");
  });

  it("recovers JSON wrapped in a code fence", () => {
    const fb = parseFeedback('```json\n{"score": 9, "correct": ["x"], "missing": ["y"], "improvement": "z"}\n```');
    expect(fb.score).toBe(9);
    expect(fb.improvement).toBe("z");
  });

  it("recovers JSON embedded in surrounding prose", () => {
    const fb = parseFeedback(
      'Here you go:\n{"score": 6, "correct": ["ok"], "missing": ["nope"], "improvement": "tip"}\nHope that helps!'
    );
    expect(fb.score).toBe(6);
    expect(fb.correct).toEqual(["ok"]);
  });

  it("clamps out-of-range scores and coerces numeric strings", () => {
    expect(parseFeedback('{"score": 15}').score).toBe(10);
    expect(parseFeedback('{"score": -4}').score).toBe(0);
    expect(parseFeedback('{"score": "8"}').score).toBe(8);
  });

  it("fills in sensible defaults when the reply is unusable", () => {
    const fb = parseFeedback("I cannot grade this.");
    expect(fb.score).toBe(0);
    expect(fb.correct.length).toBeGreaterThan(0);
    expect(fb.missing.length).toBeGreaterThan(0);
    expect(fb.improvement.length).toBeGreaterThan(0);
  });
});

describe("averageScore", () => {
  it("averages per-question scores to one decimal", () => {
    expect(averageScore([makeTurn(8), makeTurn(7)])).toBe(7.5);
    expect(averageScore([makeTurn(10), makeTurn(5), makeTurn(6)])).toBe(7);
  });

  it("returns 0 for an empty session", () => {
    expect(averageScore([])).toBe(0);
  });
});

describe("parseSummary", () => {
  it("uses the model's overall score when present", () => {
    const summary = parseSummary(
      '{"overallScore": 8.4, "strongestArea": "Closures", "areaToImprove": "Async", "note": "Nice work"}',
      [makeTurn(8)]
    );
    expect(summary.overallScore).toBe(8.4);
    expect(summary.strongestArea).toBe("Closures");
    expect(summary.areaToImprove).toBe("Async");
    expect(summary.note).toBe("Nice work");
  });

  it("falls back to the computed average when the score is missing", () => {
    const summary = parseSummary(
      '{"strongestArea": "Closures", "areaToImprove": "Async", "note": "ok"}',
      [makeTurn(8), makeTurn(6)]
    );
    expect(summary.overallScore).toBe(7);
  });

  it("provides defaults for every field on unusable replies", () => {
    const summary = parseSummary("", [makeTurn(4)]);
    expect(summary.overallScore).toBe(4);
    expect(summary.strongestArea.length).toBeGreaterThan(0);
    expect(summary.areaToImprove.length).toBeGreaterThan(0);
    expect(summary.note.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * Provider calls — fully offline, global fetch is stubbed
 * ------------------------------------------------------------------ */

const ORIGINAL_ENV = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DEMO_MODE: process.env.DEMO_MODE,
};

function clearAiEnv() {
  for (const key of Object.keys(ORIGINAL_ENV)) {
    delete process.env[key];
  }
}

function restoreAiEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function fakeResponse(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

describe("interview provider calls (stubbed fetch)", () => {
  beforeEach(() => {
    clearAiEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreAiEnv();
  });

  it("calls Gemini with the right URL, key and prompt", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ candidates: [{ content: { parts: [{ text: "Q1. What is a closure?" }] } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const question = await generateInterviewQuestion(CONFIG, 1);

    expect(question).toBe("What is a closure?");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("gemini-3.6-flash:generateContent");
    expect(url).toContain("key=test-gemini-key");
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toContain("JavaScript");
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
    // Hidden reasoning must be off, otherwise it eats the output budget and the
    // reply comes back empty or truncated mid-sentence.
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    // Question generation wants plain text, not JSON.
    expect(body.generationConfig.responseMimeType).toBeUndefined();
  });

  it("asks Gemini for JSON output when grading an answer", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"score": 5, "correct": ["a"], "missing": ["b"], "improvement": "c"}',
                },
              ],
            },
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const feedback = await evaluateInterviewAnswer(CONFIG, "Q", "A");

    expect(feedback.score).toBe(5);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
  });

  it("retries a transient 503 before giving up", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({}, false, 503))
      .mockResolvedValueOnce(
        fakeResponse({ candidates: [{ content: { parts: [{ text: "Explain hoisting" }] } }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    const question = await generateInterviewQuestion(CONFIG, 1);

    expect(question).toBe("Explain hoisting");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parses fenced evaluation JSON returned by Gemini", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n{"score": 9, "correct": ["Clear example"], "missing": [], "improvement": "Add trade-offs"}\n```',
                  },
                ],
              },
            },
          ],
        })
      )
    );

    const feedback = await evaluateInterviewAnswer(CONFIG, "What is a closure?", "A bundled scope");
    expect(feedback.score).toBe(9);
    expect(feedback.correct).toEqual(["Clear example"]);
    expect(feedback.improvement).toBe("Add trade-offs");
  });

  it("uses Anthropic when only ANTHROPIC_API_KEY is configured", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse({ content: [{ text: "Explain hoisting" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const question = await generateInterviewQuestion(CONFIG, 1);

    expect(question).toBe("Explain hoisting");
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-anthropic-key");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("uses OpenAI when only OPENAI_API_KEY is configured", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        fakeResponse({ choices: [{ message: { content: "Explain the event loop" } }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    const question = await generateInterviewQuestion(CONFIG, 1);

    expect(question).toBe("Explain the event loop");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(String(init.body)).model).toBe("gpt-4o-mini");
  });

  it("throws a helpful error when no provider key is configured", async () => {
    await expect(generateInterviewQuestion(CONFIG, 1)).rejects.toThrow(/No LLM API key/);
  });

  it("surfaces non-OK provider responses instead of silently passing", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({}, false, 429)));

    await expect(generateInterviewQuestion(CONFIG, 1)).rejects.toThrow("Gemini API Error (429)");
  });

  it("never renders an empty question when the model replies with nothing", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ candidates: [] })));

    const question = await generateInterviewQuestion(CONFIG, 2);
    expect(question).toContain("sample question 2");
  });

  it("parses the closing summary through the Gemini path", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"overallScore": 7.5, "strongestArea": "Closures", "areaToImprove": "Async", "note": "Solid effort"}',
                  },
                ],
              },
            },
          ],
        })
      )
    );

    const summary = await summarizeInterview(CONFIG, [makeTurn(7), makeTurn(8)]);
    expect(summary.overallScore).toBe(7.5);
    expect(summary.strongestArea).toBe("Closures");
    expect(summary.note).toBe("Solid effort");
  });

  it("short-circuits to the demo mock in DEMO_MODE without calling any provider", async () => {
    process.env.DEMO_MODE = "true";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const question = await generateInterviewQuestion(CONFIG, 3);
    expect(question).toContain("sample question 3");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});