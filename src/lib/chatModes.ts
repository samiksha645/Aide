/**
 * Chat modes surfaced by the mode selector above the composer.
 *
 * "general" and "coding" are fully wired up today; "interview" switches the
 * chat view into the Interview Mode experience; "study" and "documents" are
 * placeholders that render a "Soon" badge until their flows land.
 *
 * This module is intentionally free of side effects so both the client
 * (ModeSelector / ChatArea) and the server (/api/chat) can import from it.
 */
export type ChatMode = "general" | "coding" | "study" | "interview" | "documents";

export interface ChatModeOption {
  id: ChatMode;
  label: string;
  /** Short blurb shown in the selector menu */
  hint: string;
  /** Whether the mode can be selected right now */
  enabled: boolean;
  /** Small glyph shown in the closed pill */
  glyph: string;
}

export const CHAT_MODES: ChatModeOption[] = [
  { id: "general", label: "General", hint: "Everyday help and questions", enabled: true, glyph: "✦" },
  { id: "coding", label: "Coding", hint: "Software engineering answers", enabled: true, glyph: "⌘" },
  { id: "study", label: "Study", hint: "Coming soon", enabled: false, glyph: "✎" },
  { id: "interview", label: "Interview", hint: "AI mock interview with scoring", enabled: true, glyph: "🎤" },
  { id: "documents", label: "Documents", hint: "Coming soon", enabled: false, glyph: "▤" },
];

export const DEFAULT_CHAT_MODE: ChatMode = "general";

/** Type guard for values coming from localStorage / request headers. */
export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && CHAT_MODES.some((m) => m.id === value);
}

/** Resolve a mode id to its option, falling back to General. */
export function getChatMode(mode: unknown): ChatModeOption {
  return CHAT_MODES.find((m) => m.id === mode) ?? CHAT_MODES[0];
}

/**
 * Extra system-instruction text appended to the assistant prompt for the
 * current chat mode. Returns an empty string for General so behaviour is
 * unchanged there.
 */
export function chatModeInstruction(mode: unknown): string {
  switch (mode) {
    case "coding":
      return "The user is in Coding mode. Act as a senior software engineer: give correct, runnable code, explain key trade-offs briefly, and prefer concise, production-quality solutions over lengthy prose.";
    case "study":
      return "The user is in Study mode. Explain concepts step by step, check understanding, and use simple analogies.";
    case "documents":
      return "The user is in Documents mode. Ground every answer in the provided document content and cite the relevant sections.";
    default:
      return "";
  }
}