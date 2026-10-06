"use client";

import React, { useEffect } from "react";

export interface ShortcutEntry {
  keys: string[];
  label: string;
}

/** Single source of truth for the app-wide keyboard shortcuts shown in the "?" popover. */
export const SHORTCUTS: ShortcutEntry[] = [
  { keys: ["Ctrl", "K"], label: "Open search" },
  { keys: ["Ctrl", "N"], label: "New chat" },
  { keys: ["Ctrl", "/"], label: "Focus chat input" },
  { keys: ["Ctrl", "B"], label: "Toggle sidebar" },
  { keys: ["Esc"], label: "Close modal or menu" },
];

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Unobtrusive keyboard-shortcut cheat sheet, revealed by the small "?" button
 * in the chat header. Closes on Escape, backdrop click, or the close button.
 */
export function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-sm bg-cream-50 dark:bg-charcoal-900 border border-cream-300 dark:border-charcoal-800 rounded-2xl shadow-2xl p-5 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Keyboard shortcuts</h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1 rounded-lg transition"
            title="Close"
            aria-label="Close shortcuts"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ul className="space-y-2.5">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-stone-600 dark:text-stone-300">{shortcut.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-1.5 py-0.5 min-w-[22px] text-center rounded-md border border-cream-300 dark:border-charcoal-750 bg-cream-100 dark:bg-charcoal-850 text-[10px] font-mono text-stone-600 dark:text-stone-300"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}