"use client";

import React from "react";

interface MemoryPromptCardProps {
  fact: string;
  category: string;
  conversationId: string;
  onSave?: (fact: string, category: string, conversationId: string) => void;
  onDiscard?: (fact: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Personal: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700/50",
  Preferences: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700/40",
  Interests: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/40",
};

export function MemoryPromptCard({ fact, category, conversationId, onSave, onDiscard }: MemoryPromptCardProps) {
  const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.Preferences;

  return (
    <div className="flex justify-start w-full">
      <div className="max-w-[85%] sm:max-w-[75%] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <div className="flex items-start gap-2.5">
          <span className="text-base shrink-0 mt-0.5">🧠</span>
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-stone-800 dark:text-stone-200">Remember this?</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${colorClass}`}>
                {category}
              </span>
            </div>
            <p className="text-xs italic text-stone-600 dark:text-stone-400 leading-relaxed">
              &quot;{fact}&quot;
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDiscard?.(fact)}
                className="px-3 py-1 text-[11px] font-medium rounded-full border border-stone-300 dark:border-charcoal-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-charcoal-800 transition"
              >
                Don&apos;t Save
              </button>
              <button
                onClick={() => onSave?.(fact, category, conversationId)}
                className="px-3 py-1 text-[11px] font-medium rounded-full bg-warmorange-500 hover:bg-warmorange-600 text-white transition shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
