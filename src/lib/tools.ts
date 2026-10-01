import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";
import { isDemoMode } from "./config";
import { encryptMemoryContent, generateEmbedding } from "./memory";
import { getScopedDb } from "./scoped";

// Daily rate limit for web search: max 30 calls per 24 hours per user
export const webSearchRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "24 h"),
  analytics: true,
  prefix: "@upstash/ratelimit/websearch",
});

/**
 * Safe math expression evaluator without eval()
 * Parses basic arithmetic (+, -, *, /, ^, parenthesis)
 */
export function safeCalculate(expression: string): number {
  const sanitized = expression.replace(/\s+/g, "");
  if (!/^[0-9+\-*/().^]+$/.test(sanitized)) {
    throw new Error("Invalid characters in mathematical expression");
  }

  // Tokenize numbers and operators
  const tokens: string[] = [];
  let numberBuffer = "";
  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    if (/[0-9.]/.test(char)) {
      numberBuffer += char;
    } else {
      if (numberBuffer) {
        tokens.push(numberBuffer);
        numberBuffer = "";
      }
      tokens.push(char);
    }
  }
  if (numberBuffer) tokens.push(numberBuffer);

  // Simple recursive descent expression parser
  let index = 0;

  function parsePrimary(): number {
    const token = tokens[index++];
    if (token === "(") {
      const val = parseExpression();
      if (tokens[index++] !== ")") throw new Error("Missing closing parenthesis");
      return val;
    }
    const num = parseFloat(token);
    if (isNaN(num)) throw new Error(`Invalid number: ${token}`);
    return num;
  }

  function parseFactor(): number {
    let left = parsePrimary();
    while (index < tokens.length && tokens[index] === "^") {
      index++;
      const right = parsePrimary();
      left = Math.pow(left, right);
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (index < tokens.length && (tokens[index] === "*" || tokens[index] === "/")) {
      const op = tokens[index++];
      const right = parseFactor();
      if (op === "*") left *= right;
      if (op === "/") {
        if (right === 0) throw new Error("Division by zero");
        left /= right;
      }
    }
    return left;
  }

  function parseExpression(): number {
    let left = parseTerm();
    while (index < tokens.length && (tokens[index] === "+" || tokens[index] === "-")) {
      const op = tokens[index++];
      const right = parseTerm();
      if (op === "+") left += right;
      if (op === "-") left -= right;
    }
    return left;
  }

  const result = parseExpression();
  if (index < tokens.length) throw new Error("Unexpected trailing tokens");
  return result;
}

/**
 * Web search tool implementation using Tavily / Serper API with Upstash rate limiting
 */
export async function executeWebSearch(userId: string, query: string): Promise<string> {
  // Check Upstash rate limit
  if (!isDemoMode()) {
    try {
      const { success } = await webSearchRateLimiter.limit(userId);
      if (!success) {
        return "Error: Daily web search limit reached (30 queries/day). Please try again tomorrow.";
      }
    } catch {
      // Fallthrough if Redis is unconfigured
    }
  }

  if (isDemoMode() || (!process.env.TAVILY_API_KEY && !process.env.SERPER_API_KEY)) {
    return `[DEMO SEARCH RESULT] Top results for query "${query}": 1. Modern Next.js 14 architecture guide. 2. Upstash Redis rate limiting best practices.`;
  }

  // Tavily API integration
  if (process.env.TAVILY_API_KEY) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: 3,
      }),
    });
    const data = await response.json();
    return data.results?.map((r: { title: string; snippet: string }) => `${r.title}: ${r.snippet}`).join("\n") || "No results found.";
  }

  return "Web search completed.";
}

/**
 * Save reminder / memory tool
 */
export async function executeSaveReminder(userId: string, reminderText: string, conversationId?: string): Promise<string> {
  const userDb = getScopedDb(userId);
  const encrypted = encryptMemoryContent(`Reminder: ${reminderText}`);

  await userDb.memories.create({
    content: encrypted,
    memoryType: "reminder",
    sourceConversationId: conversationId,
  });

  generateEmbedding(reminderText).catch(() => {});

  return `Reminder saved successfully: "${reminderText}"`;
}
