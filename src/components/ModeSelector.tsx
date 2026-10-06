"use client";

import React, { useEffect, useState } from "react";
import { CHAT_MODES, getChatMode, type ChatMode } from "@/lib/chatModes";

interface ModeSelectorProps {
  mode: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  /** Which way the menu opens relative to the trigger (defaults to upward). */
  menuPlacement?: "top" | "bottom";
  className?: string;
}

/**
 * Small pill selector (mirrors the model selector styling) used next to the
 * composer to switch between General / Coding / Study / Interview / Documents.
 * Modes that aren't wired up yet render a disabled "Soon" row.
 */
export function ModeSelector({
  mode,
  onModeChange,
  menuPlacement = "top",
  className = "",
}: ModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const active = getChatMode(mode);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const placement = menuPlacement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5";

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 bg-cream-50 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-full px-3 py-1.5 transition select-none focus-visible:ring-2 focus-visible:ring-warmorange-400/40 outline-none"
        title="Choose chat mode"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden>{active.glyph}</span>
        <span>{active.label}</span>
        <span className="text-stone-400 dark:text-stone-500">mode</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Chat mode"
          className={`absolute ${placement} left-0 w-64 bg-white dark:bg-charcoal-900 border border-cream-300 dark:border-charcoal-800 rounded-xl shadow-xl p-1.5 z-30 animate-pop-in`}
        >
          <p className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide text-stone-400 dark:text-stone-500">
            Chat mode
          </p>
          {CHAT_MODES.map((opt) => (
            <button
              key={opt.id}
              role="menuitemradio"
              aria-checked={mode === opt.id}
              disabled={!opt.enabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!opt.enabled) return;
                onModeChange?.(opt.id);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs transition ${
                !opt.enabled
                  ? "opacity-50 cursor-not-allowed text-stone-500 dark:text-stone-400"
                  : mode === opt.id
                  ? "bg-cream-100 dark:bg-charcoal-800 text-stone-900 dark:text-stone-100"
                  : "text-stone-600 dark:text-stone-300 hover:bg-cream-100 dark:hover:bg-charcoal-850"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span aria-hidden className="shrink-0">{opt.glyph}</span>
                <span className="flex flex-col items-start min-w-0">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[10px] text-stone-400 dark:text-stone-500">{opt.hint}</span>
                </span>
              </span>
              {!opt.enabled ? (
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-cream-200 dark:bg-charcoal-800 text-stone-500 dark:text-stone-400">
                  Soon
                </span>
              ) : mode === opt.id ? (
                <svg className="w-3.5 h-3.5 text-warmorange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}