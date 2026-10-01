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
 * Lightweight heuristic extraction prompt
 */
export async function extractDurableFact(userMessage: string, assistantMessage: string): Promise<string | null> {
  const lower = userMessage.toLowerCase();

  // Fast pattern match for explicit name statements ("my name is X", "I am X", "call me X", "name's X")
  const nameMatch = userMessage.match(/(?:my name is|name's|call me|i am)\s+([a-zA-Z]+)/i);
  if (nameMatch && nameMatch[1]) {
    const cleanName = nameMatch[1].trim();
    const reservedWords = ["a", "an", "the", "ready", "here", "fine", "good", "happy", "sorry", "tired", "using", "testing", "sure", "ok", "okay"];
    if (!reservedWords.includes(cleanName.toLowerCase())) {
      const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      return `User's name is ${formattedName}`;
    }
  }

  // Fast pattern match for preferences / durable facts
  const prefMatch = userMessage.match(/\bi (?:like|love|prefer|work with|work on|use|build)\s+(.+)/i);
  if (prefMatch && prefMatch[1]) {
    return `User preference: ${userMessage.trim()}`;
  }

  if (isDemoMode()) {
    if (lower.includes("like") || lower.includes("love") || lower.includes("working on") || lower.includes("prefer") || lower.includes("i am") || lower.includes("my name")) {
      return `User stated: "${userMessage}"`;
    }
    return null;
  }

  // Real LLM call for extraction
  try {
    if (process.env.GEMINI_API_KEY) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{
                text: `Analyze this exchange:\nUser: "${userMessage}"\nAssistant: "${assistantMessage}"\nIs there a durable fact worth remembering about the user here? (preference, ongoing project, important personal detail). If yes, return it as a single short sentence. If no, respond with exactly "NULL".`
              }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.2,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/^["']|["']$/g, "");
        if (result && result.toUpperCase() !== "NULL") {
          return result;
        }
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
          max_tokens: 100,
          messages: [
            {
              role: "user",
              content: `Analyze this exchange:\nUser: "${userMessage}"\nAssistant: "${assistantMessage}"\nIs there a durable fact worth remembering about the user here? (preference, ongoing project, important personal detail). If yes, return it as a single short sentence. If no, respond with exactly "NULL".`,
            },
          ],
        }),
      });

      const data = await response.json();
      const result = data.content?.[0]?.text?.trim().replace(/^["']|["']$/g, "");
      if (result && result.toUpperCase() !== "NULL") {
        return result;
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
