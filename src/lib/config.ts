// Config helper for DEMO_MODE toggle
export const isDemoMode = (): boolean => {
  return process.env.DEMO_MODE === "true";
};

/**
 * Mock LLM response used when DEMO_MODE="true".
 * Useful to prevent spending real API tokens during UI testing or public demos.
 */
export async function getMockLLMResponse(prompt: string) {
  return {
    id: `mock-msg-${Date.now()}`,
    role: "assistant",
    content: `[DEMO MODE] This is a mocked LLM response for prompt: "${prompt}". DEMO_MODE is currently enabled.`,
    tokenCount: 42,
    costUsd: 0.0,
  };
}
