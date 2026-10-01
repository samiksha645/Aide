/**
 * Model pricing constants (USD per 1,000,000 tokens).
 *
 * Gemini 2.0 Flash (free tier) costs $0.00 — token counts are still
 * tracked for transparency in the UI.
 */
export const MODEL_PRICING: Record<string, { promptPricePerM: number; completionPricePerM: number }> = {
  // Gemini free tier — $0.00
  "gemini-3.6-flash": {
    promptPricePerM: 0,
    completionPricePerM: 0,
  },
  "gemini-2.0-flash": {
    promptPricePerM: 0,
    completionPricePerM: 0,
  },
  "gemini-1.5-flash": {
    promptPricePerM: 0,
    completionPricePerM: 0,
  },
  // Legacy / fallback entries (kept for reference)
  "claude-3-5-sonnet": {
    promptPricePerM: 3.0,
    completionPricePerM: 15.0,
  },
  "gpt-4o-mini": {
    promptPricePerM: 0.15,
    completionPricePerM: 0.6,
  },
  "demo-mock": {
    promptPricePerM: 0.0,
    completionPricePerM: 0.0,
  },
};

export const DEFAULT_MODEL = "gemini-3.6-flash";

/**
 * Calculates estimated cost in USD for a given token count and model.
 */
export function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const promptCost = (promptTokens / 1_000_000) * pricing.promptPricePerM;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionPricePerM;
  return Number((promptCost + completionCost).toFixed(6));
}

/**
 * Simple heuristic for token counting when exact tokenizer isn't available: ~4 chars per token
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

