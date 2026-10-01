// Aide home page
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sidebar, Conversation } from "@/components/Sidebar";
import { ChatArea, Message, ToolStep } from "@/components/ChatArea";
import { SettingsModal } from "@/components/SettingsModal";
import dynamic from "next/dynamic";

const AmbientScene = dynamic(
  () => import("@/components/AmbientScene").then((m) => m.AmbientScene),
  { ssr: false }
);

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasAuthFailed, setHasAuthFailed] = useState(false);
  const [activeToolStep, setActiveToolStep] = useState<ToolStep | null>(null);
  const [completedToolSteps, setCompletedToolSteps] = useState<ToolStep[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [model, setModel] = useState("aide-flash");
  const abortRef = useRef<AbortController | null>(null);

  const attemptDemoGuestLogin = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/demo-guest", { method: "POST" });
      if (res.ok) {
        const guestCredentials = await res.json();
        const signInRes = await signIn("credentials", {
          redirect: false,
          email: guestCredentials.email,
          password: guestCredentials.password,
        });

        if (!signInRes?.error) {
          router.refresh();
          return;
        }
      }
    } catch {
      // Fallthrough to redirect
    }

    setHasAuthFailed(true);
    router.push("/login");
  }, [router]);

  // Auto-login guest user when DEMO_MODE="true" or redirect unauthenticated user to /login
  useEffect(() => {
    if (status === "unauthenticated" && !hasAuthFailed) {
      attemptDemoGuestLogin();
    }
  }, [status, hasAuthFailed, attemptDemoGuestLogin]);

  const fetchConversations = useCallback(async () => {
    if (status !== "authenticated" || hasAuthFailed) return;

    try {
      const res = await fetch("/api/conversations");
      if (res.status === 401) {
        setHasAuthFailed(true);
        router.push("/login");
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch conversations (${res.status})`);
      }
      const data = await res.json();
      setConversations(data.conversations || []);
      if (data.conversations?.length > 0 && !activeId) {
        setActiveId(data.conversations[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading conversations";
      setErrorMessage(msg);
    }
  }, [status, hasAuthFailed, activeId, router]);

  useEffect(() => {
    if (status === "authenticated" && !hasAuthFailed) {
      fetchConversations();
    }
  }, [status, hasAuthFailed, fetchConversations]);

  // Restore sidebar collapse preference (persisted in localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aide-sidebar-collapsed");
      if (saved !== null) setIsSidebarCollapsed(saved === "true");
    } catch {
      // localStorage unavailable — default to expanded
    }
  }, []);

  // Toggle between full sidebar and thin icon rail, remembering the choice
  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("aide-sidebar-collapsed", String(next));
      } catch {
        // Ignore persistence failures
      }
      return next;
    });
  }, []);

  // Restore selected model preference (persisted in localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aide-model");
      if (saved === "aide-flash" || saved === "demo") setModel(saved);
    } catch {
      // localStorage unavailable — keep default
    }
  }, []);

  const handleModelChange = useCallback((next: string) => {
    setModel(next);
    try {
      localStorage.setItem("aide-model", next);
    } catch {
      // Ignore persistence failures
    }
  }, []);

  // Abort the in-flight chat request (Stop button)
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const truncateFromMessage = useCallback(async (messageId: string) => {
    try {
      const res = await fetch(`/api/messages/${messageId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        console.error("Failed to truncate messages:", res.status);
      }
    } catch (err) {
      console.error("Failed to truncate messages:", err);
    }
  }, []);

  // Create a new conversation (New chat button + Ctrl+K shortcut)
  const handleNewConversation = useCallback(async () => {
    if (status !== "authenticated" || hasAuthFailed) return;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New conversation" }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversations((prev) => [data.conversation, ...prev]);
        setActiveId(data.conversation.id);
      }
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  }, [status, hasAuthFailed]);

  // Global keyboard shortcuts: Ctrl+K new chat · Ctrl+B toggle sidebar · Esc close modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleNewConversation();
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebarCollapsed();
      } else if (e.key === "Escape") {
        setIsSettingsOpen(false);
        setIsMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewConversation, toggleSidebarCollapsed]);

  // Pin / unpin a conversation (optimistic, persisted via PATCH)
  const handleTogglePin = useCallback(async (id: string, pinned: boolean) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned } : c)));
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) throw new Error(`Failed to update pin (${res.status})`);
    } catch (err) {
      console.error("Failed to update pin:", err);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !pinned } : c)));
    }
  }, []);

  // Archive / unarchive a conversation (optimistic, persisted via PATCH)
  const handleToggleArchive = useCallback(async (id: string, archived: boolean) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, archived } : c)));
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) throw new Error(`Failed to update archive (${res.status})`);
    } catch (err) {
      console.error("Failed to update archive:", err);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, archived: !archived } : c)));
    }
  }, []);

  if (status === "loading") {
    return (
      <div className="h-screen w-screen bg-warmtaupe-base dark:bg-charcoal-950 text-stone-500 dark:text-stone-400 flex items-center justify-center font-sans text-sm transition-colors duration-300">
        <div className="flex items-center space-x-3">
          <span className="w-3 h-3 rounded-full bg-indigo-500 animate-ping"></span>
          <span>Initializing Aide session...</span>
        </div>
      </div>
    );
  }

  const fetchConversationMessages = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to load messages (${res.status})`);
      }
      const data = await res.json();
      setMessages(data.conversation?.messages || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading conversation messages";
      setErrorMessage(msg);
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setConversations(
          conversations.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
        );
      }
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const remaining = conversations.filter((c) => c.id !== id);
        setConversations(remaining);
        if (activeId === id) {
          setActiveId(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  // Core streaming flow shared by send / regenerate / edit-resubmit
  const runChatStream = async (text: string, targetConvId: string, appendUserTemp = true) => {
    if (isStreaming) return;

    setIsStreaming(true);
    setActiveToolStep(null);
    setCompletedToolSteps([]);

    if (appendUserTemp) {
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          role: "user",
          content: text,
          tokenCount: Math.ceil(text.length / 4),
          costUsd: 0.00001,
        },
      ]);
    }

    const assistantMsgId = `assistant-${Date.now()}`;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Respect the user's memory preference from Settings → Memory
      let memoryEnabled = true;
      try {
        memoryEnabled = localStorage.getItem("aide-memory-enabled") !== "false";
      } catch {
        // Default to enabled if localStorage is unavailable
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-aide-memory": memoryEnabled ? "enabled" : "disabled",
        },
        body: JSON.stringify({ conversationId: targetConvId, message: text }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to send message");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          tokenCount: 0,
          costUsd: 0,
          toolSteps: [],
        },
      ]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      const currentToolSteps: ToolStep[] = [];
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
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);

              if (parsed.type === "tool_call") {
                const step: ToolStep = {
                  tool: parsed.tool,
                  query: parsed.query,
                  status: parsed.status,
                };
                setActiveToolStep(step);
              } else if (parsed.type === "tool_result") {
                currentToolSteps.push({
                  tool: parsed.tool,
                  query: "",
                  output: parsed.output,
                });
                setActiveToolStep(null);

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, toolSteps: [...currentToolSteps] } : m
                  )
                );
              } else if (parsed.type === "title_update" && parsed.title) {
                setConversations((prev) =>
                  prev.map((c) => (c.id === targetConvId ? { ...c, title: parsed.title } : c))
                );
              } else if (parsed.type === "text" || parsed.text) {
                const textChunk = parsed.text || parsed.content || "";
                assistantText += textChunk;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: assistantText, toolSteps: [...currentToolSteps] }
                      : m
                  )
                );
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        // User pressed Stop — keep whatever streamed in; server state is refetched below
      } else {
        console.error("Streaming error:", err);
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setActiveToolStep(null);
      if (targetConvId) {
        fetchConversationMessages(targetConvId);
        fetchConversations();
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    let targetConvId = activeId;

    if (!targetConvId) {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: input.trim().slice(0, 30) }),
        });
        if (res.ok) {
          const data = await res.json();
          targetConvId = data.conversation.id;
          setConversations([data.conversation, ...conversations]);
          setActiveId(targetConvId);
        }
      } catch (err) {
        console.error("Error auto-creating conversation:", err);
        return;
      }
    }

    if (!targetConvId) return;

    const userMsgText = input.trim();
    setInput("");
    await runChatStream(userMsgText, targetConvId, true);
  };

  // Regenerate: drop this assistant reply (and anything after it), then resend the preceding user message
  const handleRegenerate = async (assistantMsgId: string) => {
    if (isStreaming || !activeId) return;
    const idx = messages.findIndex((m) => m.id === assistantMsgId);
    if (idx === -1) return;

    let userIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userIdx = i;
        break;
      }
    }
    if (userIdx === -1) return;

    const userText = messages[userIdx].content;
    await truncateFromMessage(assistantMsgId);
    setMessages(messages.slice(0, idx));
    await runChatStream(userText, activeId, false);
  };

  // Edit a user message: truncate it + its replies on the server, then resubmit the new text
  const handleEditMessage = async (userMsgId: string, newText: string) => {
    if (isStreaming || !activeId) return;
    const text = newText.trim();
    if (!text) return;

    const idx = messages.findIndex((m) => m.id === userMsgId);
    if (idx === -1 || messages[idx].role !== "user") return;

    await truncateFromMessage(userMsgId);
    setMessages(messages.slice(0, idx));
    await runChatStream(text, activeId, true);
  };

  const currentConversation = conversations.find((c) => c.id === activeId);
  // Active conversation usage (from the loaded messages)
  const conversationTokens = messages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
  const conversationCost = messages.reduce((sum, m) => sum + (m.costUsd || 0), 0);
  // Overall usage across all conversations (aggregated by /api/conversations)
  const overallTokens = conversations.reduce((sum, c) => sum + (c.tokens || 0), 0);
  const overallCost = conversations.reduce((sum, c) => sum + (c.cost || 0), 0);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-warmtaupe-base dark:bg-charcoal-950 font-sans relative antialiased p-0 md:p-2.5 gap-0 md:gap-2.5 transition-colors duration-300">
      {/* Whole-page Ambient 3D Animation Scene */}
      <AmbientScene />

      {/* Visible Error Notification Banner */}
      {errorMessage && (
        <div className="absolute top-4 right-4 z-50 bg-charcoal-900 border border-warmorange-500/40 text-stone-100 text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-3">
          <span className="text-warmorange-400">⚠️</span>
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-stone-400 hover:text-stone-100 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Left Sidebar — collapsible to a thin icon rail (ChatGPT/Claude style) */}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          fetchConversationMessages(id);
          setIsMobileSidebarOpen(false);
        }}
        onNew={() => {
          handleNewConversation();
          setIsMobileSidebarOpen(false);
        }}
        onRename={handleRenameConversation}
        onDelete={handleDeleteConversation}
        onTogglePin={handleTogglePin}
        onToggleArchive={handleToggleArchive}
        userEmail={session?.user?.email}
        userName={session?.user?.name}
        isCollapsed={isSidebarCollapsed}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* 2. Chat Area — single centered column */}
      <ChatArea
        messages={messages}
        input={input}
        setInput={setInput}
        onSend={handleSend}
        isStreaming={isStreaming}
        activeToolStep={activeToolStep}
        conversationTitle={currentConversation?.title || "New conversation"}
        userName={session?.user?.name || session?.user?.email}
        onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebarCollapsed}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onStop={handleStop}
        onRegenerate={handleRegenerate}
        onEditMessage={handleEditMessage}
        model={model}
        onModelChange={handleModelChange}
      />

      {/* 3. Settings Modal (General / Memory / Usage / Account) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userEmail={session?.user?.email}
        userName={session?.user?.name}
        totalTokens={overallTokens}
        totalCost={overallCost}
        conversationTokens={conversationTokens}
        conversationCost={conversationCost}
        conversationUsage={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          tokens: c.tokens || 0,
          cost: c.cost || 0,
        }))}
      />
    </div>
  );
}

