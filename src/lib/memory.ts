import crypto from "crypto";
import { db } from "@/lib/db";
import { getScopedDb } from "@/lib/scoped";
import { isDemoMode } from "@/lib/config";

const ENCRYPTION_SECRET = process.env.MEMORY_ENCRYPTION_KEY || "default-32-byte-secret-key-aide-1234567890123456";
const ALGORITHM = "aes-256-gcm";

// Derive 32-byte buffer key
const getKey = () => crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();

/**
 * Symmetric encryption for Memory content (AES-256-GCM)
 */
export function encryptMemoryContent(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted Memory content
 */
export function decryptMemoryContent(encryptedText: string): string {
  try {
    const [ivHex, authTagHex, encryptedData] = encryptedText.split(":");
    if (!ivHex || !authTagHex || !encryptedData) return encryptedText;

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // Return raw text if not encrypted
    return encryptedText;
  }
}

/** The three user-facing buckets shown under Settings → Memory. */
export type MemoryCategory = "Personal" | "Preferences" | "Interests";

export const MEMORY_CATEGORIES: MemoryCategory[] = ["Personal", "Preferences", "Interests"];

/** True when a stored `memoryType` maps onto one of the three Settings → Memory buckets. */
export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === "string" && (MEMORY_CATEGORIES as string[]).includes(value);
}

// Keyword signals (checked in priority order) used to bucket a fact by its content.
const PERSONAL_PATTERN =
  /\b(my name is|name is|call me|i live in|live in|i work (?:at|for|as)|my (?:role|job|title|profession|age|birthday|timezone|pronouns|location|city|country)|i am (?:a|an|the)|i'm (?:a|an|the))\b/i;
const PREFERENCES_PATTERN =
  /\b(like|likes|love|loves|prefer|prefers|preference|preferences|favourite|favorite|dislike|hate|use|uses|using|tool|tools|style|format|concise|detailed|short answers|tone|respond|always|never|avoid)\b/i;
const INTERESTS_PATTERN =
  /\b(interested|curious|learning|studying|study|research|researching|exploring|hobby|hobbies|working on|building|project|topic|topics|goal|goals|reading|watching|playing|into)\b/i;

/**
 * Infer which bucket a durable memory belongs to from its content.
 * Personal facts (identity / location) win, then explicit preferences, then interests.
 * Falls back to "Interests" when no signal matches.
 */
export function inferMemoryCategory(content: string): MemoryCategory {
  const text = (content || "").toLowerCase();
  if (PERSONAL_PATTERN.test(text)) return "Personal";
  if (PREFERENCES_PATTERN.test(text)) return "Preferences";
  if (INTERESTS_PATTERN.test(text)) return "Interests";
  return "Interests";
}

/**
 * Resolve the `memoryType` value to persist when a memory is saved.
 * - A supplied bucket category (case-insensitive) is normalised and kept.
 * - Non-bucket types such as "reminder" are preserved so they still round-trip.
 * - Otherwise the category is inferred from the fact's content.
 */
export function resolveMemoryCategory(provided: unknown, content: string): string {
  if (typeof provided === "string" && provided.trim()) {
    const trimmed = provided.trim();
    const match = MEMORY_CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (match) return match;
    // Keep explicitly-typed non-bucket memories (e.g. "reminder") as-is.
    if (trimmed.toLowerCase() !== "fact") return trimmed;
  }
  return inferMemoryCategory(content);
}

/**
 * Generate dummy 1536-dimensional embedding vector (or call OpenAI embeddings API)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (isDemoMode() || !process.env.OPENAI_API_KEY) {
    // Generate deterministic 1536-dim vector for testing/demo
    const hash = crypto.createHash("sha256").update(text).digest();
    const vec: number[] = new Array(1536);
    for (let i = 0; i < 1536; i++) {
      vec[i] = (hash[i % hash.length] - 128) / 128;
    }
    return vec;
  }

  // Real OpenAI Embeddings API call (text-embedding-3-small)
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  const data = await res.json();
  return data.data[0].embedding;
}

/**
 * Turn a model's extraction reply into a `{ fact, category }` pair.
 * Strips ```json fences (Gemini adds them even when told not to), returns null
 * for "NULL"/empty replies, and never saves raw JSON or fence markup as a fact.
 */
export function parseExtractedFact(raw: string | undefined | null): { fact: string; category: string } | null {
  if (!raw) return null;
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!text || text.toUpperCase() === "NULL") return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.fact === "string" && parsed.fact.trim()) {
      const fact = parsed.fact.trim();
      return { fact, category: resolveMemoryCategory(parsed.category, fact) };
    }
    return null;
  } catch {
    // Plain-text reply: keep it only if it doesn't look like broken JSON.
    if (text.startsWith("{") || text.startsWith("[")) return null;
    return { fact: text, category: resolveMemoryCategory(undefined, text) };
  }
}

/**
 * Lightweight heuristic extraction prompt
 */
export async function extractDurableFact(userMessage: string, assistantMessage: string): Promise<{ fact: string, category: string } | null> {
  const lower = userMessage.toLowerCase();

  // Fast pattern match for explicit name statements
  const nameMatch = userMessage.match(/(?:my name is|name's|call me|i am)\s+([a-zA-Z]+)/i);
  if (nameMatch && nameMatch[1]) {
    const cleanName = nameMatch[1].trim();
    const reservedWords = ["a", "an", "the", "ready", "here", "fine", "good", "happy", "sorry", "tired", "using", "testing", "sure", "ok", "okay", "from", "in", "on", "not", "just", "also", "so", "very", "new", "going", "trying", "looking"];
    // "I am learning / building / working ..." is a status, not a name.
    const looksLikeVerbForm = /ing$/i.test(cleanName) && cleanName.length > 4;
    if (!reservedWords.includes(cleanName.toLowerCase()) && !looksLikeVerbForm) {
      const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      return { fact: `User's name is ${formattedName}`, category: "Personal" };
    }
  }

  // Fast pattern match for preferences / durable facts
  const prefMatch = userMessage.match(/\bi (?:like|love|prefer|work with|work on|use|build)\s+(.+)/i);
  if (prefMatch && prefMatch[1]) {
    return { fact: `User preference: ${userMessage.trim()}`, category: "Preferences" };
  }

  if (isDemoMode()) {
    if (lower.includes("like") || lower.includes("love") || lower.includes("prefer")) {
      return { fact: `User stated: "${userMessage}"`, category: "Preferences" };
    }
    if (lower.includes("working on") || lower.includes("interested in")) {
      return { fact: `User stated: "${userMessage}"`, category: "Interests" };
    }
    if (lower.includes("i am") || lower.includes("my name") || lower.includes("live in")) {
      return { fact: `User stated: "${userMessage}"`, category: "Personal" };
    }
    return null;
  }

  // Real LLM call for extraction
  const systemPrompt = `Analyze this exchange:
User: "${userMessage}"
Assistant: "${assistantMessage}"
Is there a durable fact worth remembering about the user here? (preference, ongoing project, important personal detail). 
If yes, return it as a valid JSON object: {"fact": "the short sentence fact", "category": "Personal" | "Preferences" | "Interests"}. 
If no, respond with exactly "NULL". Do not use markdown blocks.`;

  try {
    if (process.env.GEMINI_API_KEY) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: {
            // Without this the hidden reasoning pass consumes the 150-token budget
            // and the fact comes back truncated (e.g. "- Lives"), so JSON.parse fails.
            maxOutputTokens: 150,
            temperature: 0.2,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return parseExtractedFact(data.candidates?.[0]?.content?.parts?.[0]?.text);
      }
    } else if (process.env.ANTHROPIC_API_KEY) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 150,
          messages: [{ role: "user", content: systemPrompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return parseExtractedFact(data.content?.[0]?.text);
      }
    }
  } catch (err) {
    console.error("Fact extraction failed:", err);
  }
  return null;
}

/**
 * Vector similarity search using raw SQL pgvector cosine distance.
 * Falls back to recency-based text retrieval for SQLite (local dev).
 */
export async function getRelevantMemories(userId: string, query: string, topK = 5): Promise<string[]> {
  const isPostgres = process.env.DATABASE_URL?.startsWith("postgresql") ||
                     process.env.DATABASE_URL?.startsWith("postgres");

  if (isPostgres) {
    try {
      const queryVector = await generateEmbedding(query);
      const vectorStr = `[${queryVector.join(",")}]`;

      const results = await db.$queryRawUnsafe<Array<{ id: string; content: string }>>(
        `SELECT id, content FROM "Memory" 
         WHERE "userId" = $1 AND embedding IS NOT NULL 
         ORDER BY embedding <=> $2::vector 
         LIMIT $3;`,
        userId,
        vectorStr,
        topK
      );

      return results.map((m) => decryptMemoryContent(m.content));
    } catch (err) {
      console.warn("Vector search failed, falling back to recency:", err);
    }
  }

  // SQLite / fallback: return most recent memories for this user
  const userDb = getScopedDb(userId);
  const fallbackMemories = await userDb.memories.findMany({
    orderBy: { createdAt: "desc" },
    take: topK,
  });
  return fallbackMemories.map((m) => decryptMemoryContent(m.content));
}
