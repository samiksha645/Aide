import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getScopedDb } from "@/lib/scoped";
import { isDemoMode } from "@/lib/config";
import { calculateCost, estimateTokenCount, DEFAULT_MODEL } from "@/lib/pricing";
import {
  getRelevantMemories,
  extractDurableFact,
  encryptMemoryContent,
  generateEmbedding,
} from "@/lib/memory";
import { safeCalculate, executeWebSearch, executeSaveReminder } from "@/lib/tools";
import { ChatInputSchema } from "@/lib/validation";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

const MAX_TOOL_CALLS = 3;

// Chat rate limiter: 60 messages / hour per user
const chatRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 h"),
  analytics: true,
  prefix: "@upstash/ratelimit/chat",
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Rate limiting check
  if (!isDemoMode()) {
    try {
      const { success } = await chatRateLimiter.limit(session.user.id);
      if (!success) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "text",
                  text: "⚠️ Aide's free tier usage limit was reached — try again in a moment.",
                })}\n\n`
              )
            );
            controller.close();
          },
        });
        return new NextResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
    } catch {
      // Fallthrough if Redis is offline
    }
  }

  // Zod Input Validation
  const body = await req.json().catch(() => ({}));
  const validation = ChatInputSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error.flatten() }, { status: 400 });
  }

  const { conversationId, message } = validation.data;

  const userDb = getScopedDb(session.user.id);
  const rawConversation = await userDb.conversations.findUnique(conversationId, true);

  if (!rawConversation) {
    return new NextResponse("Conversation not found", { status: 404 });
  }

  const conversation = rawConversation as typeof rawConversation & {
    messages?: Array<{ id: string; role: string; content: string }>;
  };

  // Memory can be switched off entirely from Settings → Memory; the client
  // advertises the current preference via the x-aide-memory header.
  const memoryDisabled = (req.headers.get("x-aide-memory") || "").toLowerCase() === "disabled";

  // "ask" mode = send memory_pending SSE (user must confirm); "auto" = save immediately (legacy default)
  const memoryMode = (req.headers.get("x-aide-memory-mode") || "ask").toLowerCase() as "ask" | "auto";

  // Retrieve relevant memories
  const relevantMemories = memoryDisabled
    ? []
    : await getRelevantMemories(session.user.id, message, 5);
  const memoryContext = relevantMemories.length > 0
    ? `Known context about this user:\n${relevantMemories.map((m) => `- ${m}`).join("\n")}\n\n`
    : "";

  const userTokenCount = estimateTokenCount(message);
  const userCostUsd = calculateCost(DEFAULT_MODEL, userTokenCount, 0);

  // Save user message
  await userDb.messages.create(conversationId, {
    role: "user",
    content: message,
    tokenCount: userTokenCount,
    costUsd: userCostUsd,
  });

  const encoder = new TextEncoder();
  const convWithMessages = conversation as typeof conversation & { messages?: Array<{ id: string }> };
  const existingMessageCount = convWithMessages.messages?.length || 0;
  const shouldExtractMemory = (existingMessageCount + 1) % 3 === 0;

  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let finalAssistantText = "";
      let toolCallCount = 0;
      const lowerMsg = message.toLowerCase();

      // Demo/Mock ReAct tool execution loop
      if (isDemoMode()) {
        // Step 1: Detect if message requires web search tool
        if ((lowerMsg.includes("search") || lowerMsg.includes("weather") || lowerMsg.includes("news")) && toolCallCount < MAX_TOOL_CALLS) {
          toolCallCount++;
          sendSSE({
            type: "tool_call",
            tool: "web_search",
            query: message,
            status: "Executing web search...",
          });
          await new Promise((r) => setTimeout(r, 600));

          const searchResult = await executeWebSearch(session.user.id, message);
          sendSSE({
            type: "tool_result",
            tool: "web_search",
            output: searchResult,
          });
          await new Promise((r) => setTimeout(r, 400));
        }

        // Step 2: Detect if message requires calculation
        if ((/\d+[\+\-\*\/\^]\d+/.test(message) || lowerMsg.includes("calculate") || lowerMsg.includes("math")) && toolCallCount < MAX_TOOL_CALLS) {
          toolCallCount++;
          const mathExpr = message.match(/[0-9\+\-\*\/\(\)\.\^]+/)?.[0] || "2+2";
          sendSSE({
            type: "tool_call",
            tool: "calculator",
            query: mathExpr,
            status: `Calculating ${mathExpr}...`,
          });
          await new Promise((r) => setTimeout(r, 500));

          try {
            const calcRes = safeCalculate(mathExpr);
            sendSSE({
              type: "tool_result",
              tool: "calculator",
              output: `${mathExpr} = ${calcRes}`,
            });
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : "Calculation failed";
            sendSSE({
              type: "tool_result",
              tool: "calculator",
              output: `Error: ${errorMsg}`,
            });
          }
          await new Promise((r) => setTimeout(r, 400));
        }

        // Step 3: Detect if message requests saving a reminder
        if ((lowerMsg.includes("remind me") || lowerMsg.includes("save reminder")) && toolCallCount < MAX_TOOL_CALLS) {
          toolCallCount++;
          const reminderContent = message.replace(/remind me to/i, "").trim();
          sendSSE({
            type: "tool_call",
            tool: "save_reminder",
            query: reminderContent,
            status: `Saving reminder: "${reminderContent}"...`,
          });
          await new Promise((r) => setTimeout(r, 500));

          const remResult = await executeSaveReminder(session.user.id, reminderContent, conversationId);
          sendSSE({
            type: "tool_result",
            tool: "save_reminder",
            output: remResult,
          });
          await new Promise((r) => setTimeout(r, 400));
        }

        // Generate final streamed text response
        const memoryPrefix = relevantMemories.length > 0 ? `[Context Loaded] ` : "";
        finalAssistantText = `${memoryPrefix}Based on your input${toolCallCount > 0 ? " and tool execution" : ""}, here is my answer for: "${message}".`;

        const words = finalAssistantText.split(" ");
        for (const word of words) {
          sendSSE({ type: "text", text: word + " " });
          await new Promise((r) => setTimeout(r, 30));
        }

        const assistantTokenCount = estimateTokenCount(finalAssistantText);
        const assistantCostUsd = calculateCost("demo-mock", userTokenCount, assistantTokenCount);

        await userDb.messages.create(conversationId, {
          role: "assistant",
          content: finalAssistantText,
          tokenCount: assistantTokenCount,
          costUsd: assistantCostUsd,
        });
      } else {
        // Real LLM stream execution — Gemini API (primary), Anthropic/OpenAI (legacy fallback)
        let promptTokensUsed = userTokenCount;
        let completionTokensUsed = 0;
        let modelUsed = DEFAULT_MODEL;

        try {
          if (process.env.GEMINI_API_KEY) {
            // --- Google Gemini API (streaming via generateContent) ---
            modelUsed = "gemini-3.6-flash";
            const historyMessages = (conversation.messages || []).map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            }));

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;

            const response = await fetch(geminiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  ...historyMessages,
                  { role: "user", parts: [{ text: message }] },
                ],
                systemInstruction: {
                  parts: [{ text: `You are Aide, a production-grade personal AI assistant. Be helpful, concise, and friendly. ${memoryContext}` }],
                },
                generationConfig: {
                  maxOutputTokens: 2048,
                  temperature: 0.7,
                },
              }),
            });

            if (!response.ok) {
              const errBody = await response.text();
              throw new Error(`Gemini API Error (${response.status}): ${errBody}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
              let buffer = "";
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (!dataStr) continue;

                    try {
                      const event = JSON.parse(dataStr);

                      // Extract text from candidates
                      const textPart = event.candidates?.[0]?.content?.parts?.[0]?.text;
                      if (textPart) {
                        finalAssistantText += textPart;
                        sendSSE({ type: "text", text: textPart });
                      }

                      // Extract real token counts from usageMetadata
                      if (event.usageMetadata) {
                        promptTokensUsed = event.usageMetadata.promptTokenCount || promptTokensUsed;
                        completionTokensUsed = event.usageMetadata.candidatesTokenCount || completionTokensUsed;
                      }
                    } catch {
                      // Ignore non-JSON lines
                    }
                  }
                }
              }
            }
          } else if (process.env.ANTHROPIC_API_KEY) {
            // --- Legacy Anthropic fallback ---
            modelUsed = "claude-3-5-sonnet";
            const historyMessages = (conversation.messages || []).map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }));

            const response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-3-5-sonnet-20240620",
                max_tokens: 1024,
                system: `You are Aide, a production-grade personal AI assistant. ${memoryContext}`,
                messages: [...historyMessages, { role: "user", content: message }],
                stream: true,
              }),
            });

            if (!response.ok) {
              const errBody = await response.text();
              throw new Error(`Anthropic API Error (${response.status}): ${errBody}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    try {
                      const event = JSON.parse(dataStr);

                      if (event.type === "message_start" && event.message?.usage) {
                        promptTokensUsed = event.message.usage.input_tokens || promptTokensUsed;
                      }
                      if (event.type === "content_block_delta" && event.delta?.text) {
                        finalAssistantText += event.delta.text;
                        sendSSE({ type: "text", text: event.delta.text });
                      }
                      if (event.type === "message_delta" && event.usage) {
                        completionTokensUsed = event.usage.output_tokens || 0;
                      }
                    } catch {
                      // Ignore parse noise
                    }
                  }
                }
              }
            }
          } else if (process.env.OPENAI_API_KEY) {
            // --- Legacy OpenAI fallback ---
            modelUsed = "gpt-4o-mini";
            const historyMessages = (conversation.messages || []).map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }));

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: `You are Aide personal AI assistant. ${memoryContext}` },
                  ...historyMessages,
                  { role: "user", content: message },
                ],
                stream: true,
                stream_options: { include_usage: true },
              }),
            });

            if (!response.ok) {
              const errBody = await response.text();
              throw new Error(`OpenAI API Error (${response.status}): ${errBody}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") break;

                    try {
                      const event = JSON.parse(dataStr);
                      const deltaText = event.choices?.[0]?.delta?.content;
                      if (deltaText) {
                        finalAssistantText += deltaText;
                        sendSSE({ type: "text", text: deltaText });
                      }
                      if (event.usage) {
                        promptTokensUsed = event.usage.prompt_tokens || promptTokensUsed;
                        completionTokensUsed = event.usage.completion_tokens || completionTokensUsed;
                      }
                    } catch {
                      // Ignore parse noise
                    }
                  }
                }
              }
            }
          } else {
            throw new Error("No LLM API key configured. Set GEMINI_API_KEY (recommended, free), ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env.local — or set DEMO_MODE=true.");
          }
        } catch (err: unknown) {
          const rawErr = err instanceof Error ? err.message : "An unexpected API error occurred.";
          console.error("LLM API Execution Error:", rawErr);

          let userFriendlyMsg = "Aide couldn't complete that request — the AI service didn't respond.";
          if (rawErr.includes("429") || rawErr.toLowerCase().includes("rate limit") || rawErr.toLowerCase().includes("quota")) {
            userFriendlyMsg = "Aide's free tier usage limit was reached — try again in a moment.";
          } else if (rawErr.includes("No LLM API key")) {
            userFriendlyMsg = "Aide couldn't complete that request — no AI API key configured.";
          }

          finalAssistantText = `⚠️ ${userFriendlyMsg}`;
          sendSSE({ type: "text", text: finalAssistantText });
        }

        if (!completionTokensUsed) {
          completionTokensUsed = estimateTokenCount(finalAssistantText);
        }

        const totalTokensUsed = promptTokensUsed + completionTokensUsed;
        const realCostUsd = calculateCost(modelUsed, promptTokensUsed, completionTokensUsed);

        await userDb.messages.create(conversationId, {
          role: "assistant",
          content: finalAssistantText,
          tokenCount: totalTokensUsed,
          costUsd: realCostUsd,
        });
      }

      // Auto-generate 3-5 word conversation title after first exchange
      const isDefaultOrRawTitle =
        !conversation.title ||
        conversation.title === "New conversation" ||
        conversation.title.toLowerCase().trim() === message.toLowerCase().trim().slice(0, 30);

      if (existingMessageCount <= 1 || isDefaultOrRawTitle) {
        try {
          console.log("[Auto-Title Debug] Triggering title generation for:", {
            conversationId,
            existingMessageCount,
            currentTitle: conversation.title,
            userMessage: message,
          });

          let autoTitle = "";
          if (process.env.GEMINI_API_KEY) {
            const titleUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const res = await fetch(titleUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: `Generate a 3-5 word summary title for this chat. Respond ONLY with the 3-5 word title, no quotes, no period. If the message is just a simple greeting like "hello" or "hi", generate a title like "General Inquiry" or "Initial Chat".\n\nUser message: "${message}"\nAssistant response: "${finalAssistantText.slice(0, 200)}"`,
                      },
                    ],
                  },
                ],
                generationConfig: { maxOutputTokens: 25, temperature: 0.4 },
              }),
            });
            if (res.ok) {
              const data = await res.json();
              autoTitle = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/^["']|["']$/g, "") || "";
            } else {
              console.error("[Auto-Title Error] Gemini title API returned status:", res.status);
            }
          }

          // Disambiguation & fallback title logic to prevent duplicate "hello" / "General Inquiry" titles
          const rawLower = autoTitle ? autoTitle.toLowerCase().trim() : message.toLowerCase().trim();
          const timeSuffix = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

          if (!autoTitle || ["hello", "hi", "hey", "greetings", "new conversation"].includes(rawLower)) {
            const words = message.split(/\s+/).filter(Boolean);
            if (words.length <= 2 && ["hello", "hi", "hey", "greetings"].includes(words[0]?.toLowerCase())) {
              autoTitle = `General Inquiry (${timeSuffix})`;
            } else {
              const cleanWords = words.slice(0, 4).join(" ").slice(0, 28).trim();
              autoTitle = `${cleanWords} (${timeSuffix})`;
            }
          }

          console.log("[Auto-Title Output]", {
            conversationId,
            userMessage: message,
            finalTitle: autoTitle,
            geminiApiKeySet: !!process.env.GEMINI_API_KEY,
          });

          if (autoTitle) {
            await userDb.conversations.update(conversationId, { title: autoTitle });
            sendSSE({ type: "title_update", title: autoTitle });
          }
        } catch (err) {
          console.error("Auto-titling failed:", err);
        }
      }

      // Post-response memory extraction (runs on every message)
      if (!memoryDisabled && !finalAssistantText.startsWith("⚠️ Error")) {
        try {
          const extracted = await extractDurableFact(message, finalAssistantText);
          if (extracted && extracted.fact && extracted.fact.toUpperCase() !== "NULL") {
            const factText = extracted.fact;
            const category = extracted.category || "fact";

            if (memoryMode === "auto") {
              // Auto-save mode: write to DB immediately (legacy behaviour)
              const encrypted = encryptMemoryContent(factText);
              await userDb.memories.create({
                content: encrypted,
                memoryType: category,
                sourceConversationId: conversationId,
              });
              sendSSE({ type: "memory_saved", content: factText, category });
              generateEmbedding(factText).catch(() => {});
            } else {
              // Ask mode: push pending fact to client for user confirmation
              sendSSE({ type: "memory_pending", content: factText, category, conversationId });
            }
          }
        } catch (err) {
          console.error("Fact extraction failed:", err);
        }
      }

      // Signal completion
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
