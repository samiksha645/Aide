"use client";

import React, { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "@/context/ThemeContext";

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: string;
  memoryType?: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
  userName?: string | null;
  onMemoriesUpdated?: () => void;
}

type TabType = "general" | "memory" | "usage" | "account";

export type DailyBucket = { date: string; tokens: number };

/** Small label/value row used by the Usage stat cards. */
function StatRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-stone-500 dark:text-stone-400">{label}</span>
      <span
        className={`font-mono tabular-nums ${
          green ? "text-emerald-600 dark:text-emerald-400" : "text-stone-800 dark:text-stone-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Simple last-7-days token usage bar chart (no charting dependency). */
function TokenBarChart({ data }: { data: DailyBucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.tokens));
  const MAX_BAR_PX = 72;
  return (
    <div className="flex items-end justify-between gap-1.5 h-[124px] bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-xl p-3">
      {data.map((d) => {
        const barPx = d.tokens > 0 ? Math.max(4, Math.round((d.tokens / max) * MAX_BAR_PX)) : 0;
        return (
          <div
            key={d.date}
            className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1"
            title={`${d.date}: ${d.tokens.toLocaleString()} tokens`}
          >
            <span className="text-[9px] leading-none text-stone-500 dark:text-stone-400 tabular-nums">
              {d.tokens > 0 ? d.tokens.toLocaleString() : ""}
            </span>
            <div
              className="w-full max-w-[24px] bg-warmorange-500/85 dark:bg-warmorange-500 rounded-t-md transition-all"
              style={{ height: `${barPx}px` }}
            />
            <span className="text-[9px] leading-none text-stone-400 dark:text-stone-500 whitespace-nowrap">
              {d.date}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsModal({
  isOpen,
  onClose,
  userEmail,
  userName,
  onMemoriesUpdated,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("general");
  const { themeMode, setThemeMode } = useTheme();

  // Memory state
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryMode, setMemoryMode] = useState<"ask" | "auto">("ask");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemoryDraft, setEditMemoryDraft] = useState("");

  // Usage stats state
  type UsageStats = {
    allTime: { totalConversations: number; totalMessages: number; totalTokens: number; totalCost: number };
    today: { todayConversations: number; todayMessages: number; todayTokens: number; todayCost: number };
    daily: DailyBucket[];
  };
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aide-memory-enabled");
      if (saved !== null) setMemoryEnabled(saved === "true");
      const savedMode = localStorage.getItem("aide-memory-mode") as "ask" | "auto";
      if (savedMode === "ask" || savedMode === "auto") setMemoryMode(savedMode);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === "memory") fetchMemories();
    if (isOpen && activeTab === "usage") fetchUsageStats();
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

  const fetchUsageStats = async () => {
    setLoadingUsage(true);
    try {
      const res = await fetch("/api/usage");
      if (res.ok) setUsageStats(await res.json());
    } catch (err) {
      console.error("Failed to load usage stats:", err);
    } finally {
      setLoadingUsage(false);
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

  const startEditMemory = (memory: MemoryItem) => {
    setEditingMemoryId(memory.id);
    setEditMemoryDraft(memory.content);
  };

  const cancelEditMemory = () => {
    setEditingMemoryId(null);
    setEditMemoryDraft("");
  };

  const handleUpdateMemory = async (id: string) => {
    const content = editMemoryDraft.trim();
    if (!content) return;
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        setMemories((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, content, memoryType: data?.memory?.memoryType ?? m.memoryType }
              : m
          )
        );
        if (onMemoriesUpdated) onMemoriesUpdated();
      }
    } catch (err) {
      console.error("Failed to update memory:", err);
    } finally {
      cancelEditMemory();
    }
  };

  const handleClearAllMemories = async () => {
    try {
      for (const m of memories) {
        await fetch(`/api/memories/${m.id}`, { method: "DELETE" });
      }
      setMemories([]);
      setShowClearConfirm(false);
      cancelEditMemory();
      if (onMemoriesUpdated) onMemoriesUpdated();
    } catch (err) {
      console.error("Failed to clear memories:", err);
    }
  };

  const handleToggleMemoryEnabled = (enabled: boolean) => {
    setMemoryEnabled(enabled);
    localStorage.setItem("aide-memory-enabled", String(enabled));
  };

  const handleToggleMemoryMode = (mode: "ask" | "auto") => {
    setMemoryMode(mode);
    localStorage.setItem("aide-memory-mode", mode);
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

              {memoryEnabled && (
                <div className="flex flex-col gap-1.5 pb-2 border-b border-cream-200 dark:border-charcoal-800">
                  <label className="text-sm font-medium text-stone-800 dark:text-stone-200">Save behavior</label>
                  <div className="flex bg-cream-100 dark:bg-charcoal-800 rounded-lg p-1">
                    <button
                      onClick={() => handleToggleMemoryMode("ask")}
                      className={`flex-1 text-xs py-1.5 rounded-md font-medium transition ${
                        memoryMode === "ask"
                          ? "bg-white dark:bg-charcoal-600 text-stone-900 dark:text-white shadow-sm"
                          : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                      }`}
                    >
                      Ask before saving
                    </button>
                    <button
                      onClick={() => handleToggleMemoryMode("auto")}
                      className={`flex-1 text-xs py-1.5 rounded-md font-medium transition ${
                        memoryMode === "auto"
                          ? "bg-white dark:bg-charcoal-600 text-stone-900 dark:text-white shadow-sm"
                          : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                      }`}
                    >
                      Save automatically
                    </button>
                  </div>
                </div>
              )}

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

              {/* Memory List — grouped by category */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {loadingMemories ? (
                  <div className="flex items-center justify-center h-32 text-stone-400 text-xs">
                    <span className="w-2 h-2 rounded-full bg-warmorange-400 animate-ping mr-2"></span>
                    Loading memories...
                  </div>
                ) : memories.length === 0 ? (
                  <div className="text-center py-10 text-stone-400 dark:text-stone-500 text-xs">
                    No durable memories saved yet.
                  </div>
                ) : (() => {
                  const CATEGORIES = [
                    { key: "Personal", label: "Personal", emoji: "👤", badgeClass: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700/40" },
                    { key: "Preferences", label: "Preferences", emoji: "⚙️", badgeClass: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700/40" },
                    { key: "Interests", label: "Interests", emoji: "✨", badgeClass: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/40" },
                    { key: "other", label: "Other", emoji: "📌", badgeClass: "bg-stone-100 dark:bg-charcoal-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-charcoal-700" },
                  ];
                  return CATEGORIES.map(({ key, label, emoji, badgeClass }) => {
                    const group = memories.filter((m) => {
                      const t = (m.memoryType || "fact").toLowerCase();
                      if (key === "other") return !["personal","preferences","interests"].includes(t);
                      return t.toLowerCase() === key.toLowerCase();
                    });
                    if (group.length === 0) return null;
                    return (
                      <div key={key}>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold px-1 mb-1.5 border-b pb-1 border-cream-200 dark:border-charcoal-800">
                          <span>{emoji}</span>
                          <span className={`px-1.5 py-0.5 rounded-full border ${badgeClass}`}>{label}</span>
                          <span className="text-stone-400 dark:text-stone-500 ml-auto font-normal">{group.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {group.map((m) => (
                            <div
                              key={m.id}
                              className="group bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-xl p-3 text-xs flex justify-between items-start gap-2 transition"
                            >
                              {editingMemoryId === m.id ? (
                                <div className="flex-1 space-y-1.5">
                                  <textarea
                                    autoFocus
                                    value={editMemoryDraft}
                                    onChange={(e) => setEditMemoryDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleUpdateMemory(m.id);
                                      } else if (e.key === "Escape") {
                                        e.stopPropagation();
                                        cancelEditMemory();
                                      }
                                    }}
                                    rows={2}
                                    className="w-full bg-white dark:bg-charcoal-800 border border-cream-300 dark:border-charcoal-750 rounded-lg px-2 py-1.5 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-warmorange-400 resize-none"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={cancelEditMemory}
                                      className="px-2 py-1 rounded-md border border-stone-300 dark:border-charcoal-750 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-charcoal-800 transition"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleUpdateMemory(m.id)}
                                      disabled={!editMemoryDraft.trim()}
                                      className="px-2 py-1 rounded-md bg-warmorange-500 hover:bg-warmorange-600 disabled:opacity-40 text-white font-medium transition"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <span className="text-stone-800 dark:text-stone-200 leading-relaxed">{m.content}</span>
                                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                                    <button
                                      onClick={() => startEditMemory(m)}
                                      className="text-stone-400 hover:text-warmorange-500 p-0.5 rounded transition"
                                      title="Edit memory"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMemory(m.id)}
                                      className="text-stone-400 hover:text-red-500 p-0.5 rounded transition"
                                      title="Delete memory"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* TAB 3: USAGE */}
          {activeTab === "usage" && (
            <div className="space-y-5 overflow-y-auto">
              <div>
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Usage & Stats</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  All-time and today&apos;s usage. Costs are <span className="italic">estimated</span> — actual billing may vary.
                </p>
              </div>

              {loadingUsage ? (
                <div className="flex items-center justify-center h-24 text-stone-400 text-xs">
                  <span className="w-2 h-2 rounded-full bg-warmorange-400 animate-ping mr-2"></span>
                  Loading stats...
                </div>
              ) : usageStats ? (
                <>
                  {/* All-time vs Today grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* All-time */}
                    <div className="bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 block">All-time</span>
                      <StatRow label="Conversations" value={usageStats.allTime.totalConversations.toLocaleString()} />
                      <StatRow label="Messages sent" value={usageStats.allTime.totalMessages.toLocaleString()} />
                      <StatRow label="Total tokens" value={usageStats.allTime.totalTokens.toLocaleString()} />
                      <StatRow label="Est. cost (estimated)" value={`$${usageStats.allTime.totalCost.toFixed(4)}`} green />
                    </div>
                    {/* Today */}
                    <div className="bg-cream-100 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-warmorange-500 dark:text-warmorange-400 block">Today</span>
                      <StatRow label="Conversations" value={usageStats.today.todayConversations.toLocaleString()} />
                      <StatRow label="Messages sent" value={usageStats.today.todayMessages.toLocaleString()} />
                      <StatRow label="Total tokens" value={usageStats.today.todayTokens.toLocaleString()} />
                      <StatRow label="Est. cost (estimated)" value={`$${usageStats.today.todayCost.toFixed(4)}`} green />
                    </div>
                  </div>

                  {/* 7-day bar chart */}
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 block mb-2">
                      Token usage — last 7 days
                    </span>
                    <TokenBarChart data={usageStats.daily} />
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-2 leading-relaxed">
                      Estimated cost uses published per-token pricing — your actual bill may differ.
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-10 text-stone-400 dark:text-stone-500 text-xs">Could not load usage data.</div>
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
