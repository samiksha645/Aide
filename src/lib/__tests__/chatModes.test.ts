import { describe, it, expect } from "vitest";
import {
  CHAT_MODES,
  DEFAULT_CHAT_MODE,
  chatModeInstruction,
  getChatMode,
  isChatMode,
} from "@/lib/chatModes";

describe("CHAT_MODES", () => {
  it("exposes the five modes in selector order", () => {
    expect(CHAT_MODES.map((m) => m.id)).toEqual([
      "general",
      "coding",
      "study",
      "interview",
      "documents",
    ]);
  });

  it("only enables the wired-up modes", () => {
    const enabled = CHAT_MODES.filter((m) => m.enabled).map((m) => m.id);
    expect(enabled).toEqual(["general", "coding", "interview"]);
    expect(CHAT_MODES.find((m) => m.id === "study")?.enabled).toBe(false);
    expect(CHAT_MODES.find((m) => m.id === "documents")?.enabled).toBe(false);
  });

  it("defaults to General", () => {
    expect(DEFAULT_CHAT_MODE).toBe("general");
  });
});

describe("isChatMode", () => {
  it("accepts known ids and rejects anything else", () => {
    expect(isChatMode("coding")).toBe(true);
    expect(isChatMode("interview")).toBe(true);
    expect(isChatMode("nope")).toBe(false);
    expect(isChatMode(undefined)).toBe(false);
    expect(isChatMode(null)).toBe(false);
  });
});

describe("getChatMode", () => {
  it("resolves a known mode and falls back to General", () => {
    expect(getChatMode("coding").label).toBe("Coding");
    expect(getChatMode("unknown").id).toBe("general");
    expect(getChatMode(undefined).id).toBe("general");
  });
});

describe("chatModeInstruction", () => {
  it("adds a coding instruction for Coding mode", () => {
    expect(chatModeInstruction("coding")).toContain("Coding mode");
  });

  it("returns an empty string for General (no behaviour change)", () => {
    expect(chatModeInstruction("general")).toBe("");
    expect(chatModeInstruction(undefined)).toBe("");
    expect(chatModeInstruction("nonsense")).toBe("");
  });
});