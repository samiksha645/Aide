import { describe, it, expect, vi } from "vitest";
import {
  inferMemoryCategory,
  resolveMemoryCategory,
  isMemoryCategory,
  parseExtractedFact,
  extractDurableFact,
} from "@/lib/memory";

// The inference helpers are pure, but memory.ts imports the Prisma client — stub it out.
vi.mock("@/lib/db", () => ({ db: {} }));

describe("inferMemoryCategory", () => {
  it("buckets identity / location facts as Personal", () => {
    expect(inferMemoryCategory("User's name is Sam")).toBe("Personal");
    expect(inferMemoryCategory("My name is Ada Lovelace")).toBe("Personal");
    expect(inferMemoryCategory("I live in Berlin")).toBe("Personal");
    expect(inferMemoryCategory("I am a software engineer")).toBe("Personal");
    expect(inferMemoryCategory("My job is data scientist")).toBe("Personal");
  });

  it("buckets stated likes / tools / format wishes as Preferences", () => {
    expect(inferMemoryCategory("I prefer concise answers")).toBe("Preferences");
    expect(inferMemoryCategory("I love using TypeScript and VS Code")).toBe("Preferences");
    expect(inferMemoryCategory("I like short answers with code samples")).toBe("Preferences");
    expect(inferMemoryCategory("User preference: never use jargon")).toBe("Preferences");
  });

  it("buckets topics / projects as Interests", () => {
    expect(inferMemoryCategory("I'm interested in machine learning")).toBe("Interests");
    expect(inferMemoryCategory("I am curious about astrophysics")).toBe("Interests");
    expect(inferMemoryCategory("I'm working on a robotics project")).toBe("Interests");
    expect(inferMemoryCategory("User is studying Japanese")).toBe("Interests");
  });

  it("falls back to Interests when no signal matches", () => {
    expect(inferMemoryCategory("The weather was nice today")).toBe("Interests");
    expect(inferMemoryCategory("")).toBe("Interests");
  });
});

describe("resolveMemoryCategory", () => {
  it("keeps and normalises an explicit bucket category", () => {
    expect(resolveMemoryCategory("Preferences", "User's name is Sam")).toBe("Preferences");
    expect(resolveMemoryCategory("preferences", "anything")).toBe("Preferences");
    expect(resolveMemoryCategory("PERSONAL", "anything")).toBe("Personal");
  });

  it("infers the category when the caller passes a generic 'fact' or nothing", () => {
    expect(resolveMemoryCategory("fact", "I love pizza")).toBe("Preferences");
    expect(resolveMemoryCategory(undefined, "My name is Ada")).toBe("Personal");
    expect(resolveMemoryCategory(null, "I'm interested in AI")).toBe("Interests");
  });

  it("preserves explicit non-bucket types such as reminders", () => {
    expect(resolveMemoryCategory("reminder", "buy milk")).toBe("reminder");
  });
});

describe("isMemoryCategory", () => {
  it("accepts only the three bucket names", () => {
    expect(isMemoryCategory("Personal")).toBe(true);
    expect(isMemoryCategory("Preferences")).toBe(true);
    expect(isMemoryCategory("Interests")).toBe(true);
    expect(isMemoryCategory("reminder")).toBe(false);
    expect(isMemoryCategory(undefined)).toBe(false);
  });
});

describe("parseExtractedFact", () => {
  it("parses JSON wrapped in ```json fences (real Gemini output)", () => {
    const raw = '```json\n{\n  "fact": "Lives in Berlin and is learning TypeScript",\n  "category": "Personal"\n}\n```';
    expect(parseExtractedFact(raw)).toEqual({
      fact: "Lives in Berlin and is learning TypeScript",
      category: "Personal",
    });
  });

  it("parses bare JSON and normalises the category casing", () => {
    expect(parseExtractedFact('{"fact": "Prefers dark mode", "category": "preferences"}')).toEqual({
      fact: "Prefers dark mode",
      category: "Preferences",
    });
  });

  it("returns null for NULL, empty and missing replies", () => {
    expect(parseExtractedFact("NULL")).toBeNull();
    expect(parseExtractedFact("```\nnull\n```")).toBeNull();
    expect(parseExtractedFact("")).toBeNull();
    expect(parseExtractedFact(undefined)).toBeNull();
  });

  it("never stores truncated JSON or a JSON object without a fact", () => {
    expect(parseExtractedFact('{"fact": "Lives in')).toBeNull();
    expect(parseExtractedFact('{"category": "Personal"}')).toBeNull();
  });

  it("keeps a plain-text reply and infers its category", () => {
    expect(parseExtractedFact("I live in Berlin")).toEqual({
      fact: "I live in Berlin",
      category: "Personal",
    });
  });
});
describe("extractDurableFact name heuristic", () => {
  it("extracts an explicit name", async () => {
    expect(await extractDurableFact("My name is ada", "Hi Ada")).toEqual({
      fact: "User's name is Ada",
      category: "Personal",
    });
    expect(await extractDurableFact("call me Sam", "Sure")).toEqual({
      fact: "User's name is Sam",
      category: "Personal",
    });
  });

  it('does not mistake "I am learning ..." for a name', async () => {
    const original = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true"; // keep the fallthrough offline
    try {
      const result = await extractDurableFact("I am learning TypeScript", "Nice");
      expect(result?.fact ?? "").not.toContain("name is");
    } finally {
      if (original === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = original;
    }
  });

  it("ignores status words after 'I am'", async () => {
    const original = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";
    try {
      for (const msg of ["I am happy", "I am from Berlin", "I am building an app"]) {
        const result = await extractDurableFact(msg, "ok");
        expect(result?.fact ?? "").not.toContain("name is");
      }
    } finally {
      if (original === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = original;
    }
  });
});
