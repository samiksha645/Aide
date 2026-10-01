"use client";

import React, { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useTheme, ThemeMode } from "@/context/ThemeContext";

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
  userName?: string | null;
  totalTokens?: number;
  totalCost?: number;
  conversationTokens?: number;
  conversationCost?: number;
  conversationUsage?: { id: string; title: string; tokens: number; cost: number }[];
  onMemoriesUpdated?: () => void;
}

type TabType = "general" | "memory" | "usage" | "account";

export function SettingsModal({
  isOpen,
  onClose,
  userEmail,
  userName,
  totalTokens = 0,
  totalCost = 0,
  conversationTokens = 0,
  conversationCost = 0,
  conversationUsage,
  onMemoriesUpdated,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("general");
  const { themeMode, setThemeMode } = useTheme();

  // Memory state
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aide-memory-enabled");
      if (saved !== null) {
        setMemoryEnabled(saved === "true");
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === "memory") {
      fetchMemories();
    }
  }, [isOpen, activeTab]);

  const fetchMemories = async () => {
    setLoadingMemories(true);
    try {
      const res = await fetch("/api/memories");
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch (err) {
      console.error("Failed to load memories:", err);
    } finally {
      setLoadingMemories(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
        if (onMemoriesUpdated) onMemoriesUpdated();
      }
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  const handleClearAllMemories = async () => {
    try {
      for (const m of memories) {
        await fetch(`/api/memories/${m.id}`, { method: "DELETE" });
      }
      setMemories([]);
      setShowClearConfirm(false);
      if (onMemoriesUpdated) onMemoriesUpdated();
    } catch (err) {
      console.error("Failed to clear memories:", err);
    }
  };

  const handleToggleMemoryEnabled = (enabled: boolean) => {
    setMemoryEnabled(enabled);
    localStorage.setItem("aide-memory-enabled", String(enabled));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-950/60 backdrop-blur-xs select-none animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-2xl bg-cream-50 dark:bg-charcoal-900 border border-cream-300 dark:border-charcoal-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] sm:h-[520px] max-h-[100dvh] text-stone-800 dark:text-stone-200 transition-colors animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab Navigation — horizontal scroll on mobile, vertical sidebar on md+ */}
        <div className="md:w-52 bg-cream-100/70 dark:bg-charcoal-950 md:border-r border-b md:border-b-0 border-cream-300 dark:border-charcoal-850 p-2 md:p-3 flex md:flex-col justify-between shrink-0">
          <div className="flex-1 min-w-0">
            <div className="hidden md:block px-3 py-2.5 mb-2 font-semibold text-xs text-stone-500 uppercase tracking-wider">
              Settings
            </div>

            <nav className="flex md:flex-col gap-1 md:gap-1 overflow-x-auto md:overflow-x-visible text-xs pb-0.5 md:pb-0 scrollbar-hide">
              {([
                { key: "general" as TabType, label: "General", icon: <svg className="w-4 h-4 text-warmorange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
                { key: "memory" as TabType, label: "Memory", icon: <svg className="w-4 h-4 text-warmorange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
                { key: "usage" as TabType, label: "Usage", icon: <svg className="w-4 h-4 text-warmorange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
                { key: "account" as TabType, label: "Account", icon: <svg className="w-4 h-4 text-warmorange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 md:gap-2.5 px-3 py-2 rounded-xl transition font-medium whitespace-nowrap shrink-0 ${
                    activeTab === tab.key
                      ? "bg-cream-200 dark:bg-charcoal-800 text-stone-900 dark:text-stone-100 shadow-xs"
                      : "text-stone-600 dark:text-stone-400 hover:bg-cream-200/50 dark:hover:bg-charcoal-850"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="hidden md:block pt-2 border-t border-cream-300/60 dark:border-charcoal-800">
            <button
              onClick={onClose}
              className="w-full py-2 text-xs font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition text-center"
            >
              Close
            </button>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto flex flex-col justify-between relative bg-cream-50 dark:bg-charcoal-900 min-h-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg transition z-10"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* TAB 1: GENERAL */}
          {activeTab === "general" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">General Settings</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Customize theme and interface preferences.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <label className="text-xs font-medium text-stone-700 dark:text-stone-300 block">
                  Theme Preference
                </label>
                <div className="grid grid-cols-3 gap-2 max-w-sm">
                  <button
                    onClick={() => setThemeMode("light")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                      themeMode === "light"
                        ? "border-warmorange-500 bg-warmorange-50/50 dark:bg-warmorange-500/10 text-warmorange-600 dark:text-warmorange-400 font-semibold"
                        : "border-cream-300 dark:border-charcoal-800 hover:bg-cream-100 dark:hover:bg-charcoal-850 text-stone-600 dark:text-stone-400"
                    }`}
                  >
                    <svg className="w-5 h-5 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>Light</span>
                  </button>

                  <button
                    onClick={() => setThemeMode("dark")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                      themeMode === "dark"
                        ? "border-warmorange-500 bg-warmorange-50/50 dark:bg-warmorange-500/10 text-warmorange-600 dark:text-warmorange-400 font-semibold"
                        : "border-cream-300 dark:border-charcoal-800 hover:bg-cream-100 dark:hover:bg-charcoal-850 text-stone-600 dark:text-stone-400"
                    }`}
                  >
                    <svg className="w-5 h-5 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    <span>Dark</span>
                  </button>

                  <button
                    onClick={() => setThemeMode("system")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                      themeMode === "system"
                        ? "border-warmorange-500 bg-warmorange-50/50 dark:bg-warmorange-500/10 text-warmorange-600 dark:text-warmorange-400 font-semibold"
                        : "border-cream-300 dark:border-charcoal-800 hover:bg-cream-100 dark:hover:bg-charcoal-850 text-stone-600 dark:text-stone-400"
                    }`}
                  >
                    <svg className="w-5 h-5 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>System</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MEMORY */}
          {activeTab === "memory" && (
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Durable Memory</h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    What Aide remembers about your preferences &amp; background.
                  </p>
                </div>

                {/* Memory On/Off Toggle */}
                <button
                  onClick={() => handleToggleMemoryEnabled(!memoryEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    memoryEnabled ? "bg-warmorange-500" : "bg-stone-300 dark:bg-charcoal-750"
                  }`}
                  title={memoryEnabled ? "Memory enabled" : "Memory disabled"}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      memoryEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Clear All Confirmation Dialog */}
              {showClearConfirm ? (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl space-y-3">
                  <p className="text-xs text-red-800 dark:text-red-300 font-medium">
                    Are you sure you want to clear all durable memories? This cannot be undone.
                  </p>
                  <div className="flex space-x-2 justify-end">
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-stone-300 dark:border-charcoal-750 hover:bg-stone-100 dark:hover:bg-charcoal-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleClearAllMemories}
                      className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              ) : (
                memories.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 font-medium flex items-center space-x-1"
                    >
                      <span>Clear all memories</span>
                    </button>
                  </div>
                )
              )}

              {/* Memory List */}
              <div className="flex-1 overflow-y-auto max-h-60 space-y-2 pr-1">
                {loadingMemories ? (
                  <div className="flex items-center justify-center h-32 text-stone-400 text-xs">
                    <span className="w-2 h-2 rounded-full bg-warmorange-400 animate-ping mr-2"></span>
                    Loading memories...
                  </div>
                ) : memories.length === 0 ? (
                  <div className="text-center py-10 text-stone-400 dark:text-stone-500 text-xs">
                    No durable memories saved yet.
                  </div>
                ) : (
                  memories.map((m) => (
                    <div
                      key={m.id}
                      className="group bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-xl p-3 text-xs flex justify-between items-start space-x-2 transition"
                    >
                      <span className="text-stone-800 dark:text-stone-200 leading-relaxed">
                        {m.content}
                      </span>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="text-stone-400 hover:text-red-500 p-0.5 rounded transition shrink-0 opacity-0 group-hover:opacity-100"
                        title="Delete memory"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: USAGE */}
          {activeTab === "usage" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Session &amp; Chat Usage</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Token counts and estimated API costs for your active sessions.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {/* Active Chat Usage */}
                <div className="bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-xl p-4 space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-warmorange-600 dark:text-warmorange-400 block">
                    Active Conversation
                  </span>
                  <div className="space-y-1">
                    <div className="text-xs text-stone-500 dark:text-stone-400 flex justify-between">
                      <span>Tokens:</span>
                      <strong className="font-mono text-stone-800 dark:text-stone-200">{conversationTokens.toLocaleString()}</strong>
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 flex justify-between">
                      <span>Est. Cost:</span>
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400">${conversationCost.toFixed(6)}</strong>
                    </div>
                  </div>
                </div>

                {/* Overall Session Usage */}
                <div className="bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-xl p-4 space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300 block">
                    Overall Session
                  </span>
                  <div className="space-y-1">
                    <div className="text-xs text-stone-500 dark:text-stone-400 flex justify-between">
                      <span>Total Tokens:</span>
                      <strong className="font-mono text-stone-800 dark:text-stone-200">{totalTokens.toLocaleString()}</strong>
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 flex justify-between">
                      <span>Total Cost:</span>
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400">${totalCost.toFixed(6)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Per-Conversation Breakdown */}
              {conversationUsage && conversationUsage.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300 block mb-2">
                    Per Conversation
                  </span>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {conversationUsage.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 text-xs bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-lg px-3 py-2"
                      >
                        <span className="truncate text-stone-700 dark:text-stone-300">{c.title}</span>
                        <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400 shrink-0">
                          {c.tokens.toLocaleString()} tok · ${c.cost.toFixed(6)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ACCOUNT */}
          {activeTab === "account" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Account &amp; Session</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Manage logged in user credentials.
                </p>
              </div>

              <div className="bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-xl p-4 space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-warmorange-500/20 text-warmorange-500 font-bold text-sm flex items-center justify-center">
                    {userEmail ? userEmail.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                      {userName || "Aide User"}
                    </h4>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {userEmail || "Guest Session"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-cream-300 dark:border-charcoal-800 flex justify-end">
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition flex items-center space-x-2 shadow-xs"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Log out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
