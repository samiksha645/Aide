"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { MemoryPromptCard } from "./MemoryPromptCard";

// Dynamic import with ssr: false ensures WebGL / canvas code only executes in the browser
const ThreeOrb = dynamic(
  () => import("./ThreeOrb").then((mod) => mod.ThreeOrb),
  {
    ssr: false,
    loading: () => (
      <div className="orb-container">
        <div className="orb-glow" />
        <div className="orb-body">
          <div className="orb-highlight" />
        </div>
      </div>
    ),
  }
);

export interface ToolStep {
  tool: string;
  query: string;
  status?: string;
  output?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokenCount: number;
  costUsd: number;
  toolSteps?: ToolStep[];
}

interface ChatAreaProps {
  messages: Message[];
  input: string;
  setInput: (val: string) => void;
  onSend: (textOverride?: string) => void;
  isStreaming: boolean;
  activeToolStep?: ToolStep | null;
  conversationTitle?: string;
  userName?: string | null;
  onOpenMobileMenu?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
  /** Abort the in-flight request (Stop button) */
  onStop?: () => void;
  /** Regenerate an assistant response from its preceding user message */
  onRegenerate?: (messageId: string) => void;
  /** Edit a user message and resubmit from that point */
  onEditMessage?: (messageId: string, newText: string) => void;
  /** Selected model id (persisted by the parent) */
  model?: string;
  onModelChange?: (modelId: string) => void;
  /** Pending memory fact waiting for user confirmation */
  pendingMemory?: { fact: string; category: string; conversationId: string } | null;
  onSaveMemory?: (fact: string, category: string, conversationId: string) => void;
  onDiscardMemory?: (fact: string) => void;
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
// Code blocks are always rendered on a dark surface, so one dark highlight theme fits both page themes
import "highlight.js/styles/github-dark.css";

/**
 * Recursively extract plain text from React children.
 * Needed because rehype-highlight turns code children into <span> elements,
 * so String(children) would no longer work for the Copy button.
 */
function extractText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: unknown }).children);
  }
  return "";
}

/**
 * Custom CodeBlock with syntax highlighting (via rehype-highlight),
 * a language badge and a Copy button. Also handles inline code.
 */
function CodeBlock({ className, children }: any) {
  const match = /language-(\w+)/.exec(className || "");
  const plainText = extractText(children).replace(/\n$/, "");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Inline code has no language class and no newlines (rehype-highlight only touches block code)
  const isInline = !className && !plainText.includes("\n");

  if (isInline) {
    return (
      <code className="bg-charcoal-900 border border-charcoal-750 text-warmorange-400 font-mono text-[11px] px-1.5 py-0.5 rounded">
        {children}
      </code>
    );
  }

  return (
    <div className="my-4 rounded-xl overflow-hidden bg-charcoal-900 border border-charcoal-750 text-stone-200 text-xs shadow-md">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-charcoal-950 border-b border-charcoal-800 text-[11px] text-stone-400 font-mono">
        <span className="text-warmorange-400 font-semibold uppercase tracking-wider text-[10px]">
          {match ? match[1] : "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 text-stone-400 hover:text-warmorange-400 transition"
          title="Copy code"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[10px] text-emerald-400 font-sans">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 002-2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px] font-sans">Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Highlighted tokens come in as children (spans with hljs classes) */}
      <pre className="p-3.5 overflow-x-auto font-mono text-xs leading-relaxed bg-charcoal-900">
        <code className={className || "hljs"}>{children}</code>
      </pre>
    </div>
  );
}

/**
 * Render Assistant messages using ReactMarkdown + RemarkGFM.
 * Rendered as plain text on the page background (no bubble) — all typography
 * (headings, lists, tables, bold, links, code) is styled via `.aide-prose`
 * in globals.css. Fenced code blocks get syntax highlighting via
 * rehype-highlight and the language-label + Copy chrome from CodeBlock.
 */
function FormattedContent({ content }: { content: string }) {
  return (
    <div className="aide-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Unwrap <pre> so CodeBlock owns the full chrome (label, copy, scroll area)
          pre: ({ children }) => <>{children}</>,
          code: CodeBlock,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Exported for unit tests (rendered inside ChatArea)
export { FormattedContent };

/**
 * Subtle animated "thinking" dots shown while waiting for the assistant's
 * first tokens to arrive (ChatGPT / Claude style).
 */
function ThinkingIndicator() {
  return (
    <div className="flex w-full justify-start" role="status" aria-label="Aide is thinking">
      <div className="flex items-center gap-1.5 py-2.5">
        <span className="thinking-dot" />
        <span className="thinking-dot" style={{ animationDelay: "0.15s" }} />
        <span className="thinking-dot" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}

/**
 * Model options for the small selector above the input.
 * The backend currently resolves the provider from environment variables
 * (Gemini → Anthropic → OpenAI, or demo mock), so this is a persisted
 * display preference surfaced in the UI.
 */
const MODEL_OPTIONS = [
  { id: "aide-flash", label: "Aide Flash", hint: "Fast · Free tier" },
  { id: "demo", label: "Demo Mode", hint: "Simulated replies" },
] as const;

/** Clickable suggestions shown in the empty state (fill the input on click) */
const SUGGESTIONS = [
  "Plan my study week",
  "Explain a concept",
  "Help me write an email",
  "Brainstorm ideas",
];

/* Small ghost icon button used in the per-message hover action rows */
function MessageAction({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition focus-visible:ring-2 focus-visible:ring-warmorange-400/40 outline-none ${
        active
          ? "text-warmorange-500 bg-warmorange-500/10"
          : "text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-cream-200 dark:hover:bg-charcoal-800"
      }`}
    >
      {children}
    </button>
  );
}

const CopyIcon = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 002-2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = (
  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const RefreshIcon = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

const ThumbUpIcon = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
  </svg>
);

const ThumbDownIcon = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
  </svg>
);

const PencilIcon = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

export function ChatArea({
  messages,
  input,
  setInput,
  onSend,
  isStreaming,
  activeToolStep,
  conversationTitle = "New conversation",
  userName,
  onOpenMobileMenu,
  isSidebarCollapsed = false,
  onToggleSidebar,
  onOpenSettings,
  onStop,
  onRegenerate,
  onEditMessage,
  model = "aide-flash",
  onModelChange,
  pendingMemory,
  onSaveMemory,
  onDiscardMemory,
}: ChatAreaProps) {
  const [expandedMessageIds, setExpandedMessageIds] = React.useState<Record<string, boolean>>({});

  const toggleSteps = (id: string) => {
    setExpandedMessageIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setAttachedFile(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let errorMsg = "Failed to extract text from file";
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch { /* fallback to default */ }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      setAttachedFile({ name: data.fileName, text: data.text });
    } catch (err: any) {
      setUploadError(err.message || "An error occurred");
      setTimeout(() => setUploadError(null), 5000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCustomSend = () => {
    if (!input.trim() && !attachedFile) return;
    
    let textToSend = input;
    if (attachedFile) {
      textToSend = `<attachment filename="${attachedFile.name}">\n${attachedFile.text}\n</attachment>\n${input}`;
      setAttachedFile(null);
    }
    
    onSend(textToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCustomSend();
    }
  };

  // Determine time-aware greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    let timeGreeting = "Good evening";
    if (hour < 12) {
      timeGreeting = "Good morning";
    } else if (hour < 17) {
      timeGreeting = "Good afternoon";
    }

    let displayName = "there";
    if (userName && userName.trim()) {
      const clean = userName.trim();
      const namePart = clean.includes("@") ? clean.split("@")[0] : clean.split(" ")[0];
      displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    return `${timeGreeting}, ${displayName}.`;
  };

  // --- Message actions state ---
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Partial<Record<string, "up" | "down">>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // --- Model selector menu ---
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const activeModel = MODEL_OPTIONS.find((opt) => opt.id === model);

  // --- Auto-growing input & thread scrolling ---
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const autoScrollRef = React.useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Auto-grow the textarea up to ~6 lines
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  // Close the model menu on any outside click
  React.useEffect(() => {
    if (!modelMenuOpen) return;
    const close = () => setModelMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [modelMenuOpen]);

  const updateScrollState = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < 120;
    autoScrollRef.current = nearBottom;
    setShowScrollButton(!nearBottom && el.scrollHeight > el.clientHeight + 40);
  }, []);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // Keep the thread pinned to the bottom while new content arrives,
  // unless the user has scrolled up to read
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && autoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    updateScrollState();
  }, [messages, isStreaming, updateScrollState]);

  const copyText = (id: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      // Clipboard unavailable
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
  };

  const toggleFeedback = (id: string, value: "up" | "down") => {
    setFeedback((prev) => {
      const next = { ...prev };
      if (next[id] === value) {
        delete next[id];
      } else {
        next[id] = value;
      }
      return next;
    });
  };

  const startEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditDraft(msg.content);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const submitEdit = (id: string) => {
    const text = editDraft;
    if (!text.trim()) return;
    cancelEdit();
    onEditMessage?.(id, text);
  };

  return (
    <div className="flex-1 flex flex-col bg-cream-100 dark:bg-charcoal-900 text-stone-800 dark:text-stone-200 h-full overflow-hidden relative transition-colors duration-300">
      {/* Center panel Header bar */}
      <header className="px-4 md:px-6 py-3.5 border-b border-cream-300 dark:border-charcoal-800 flex items-center justify-between bg-cream-50/90 dark:bg-charcoal-900/90 backdrop-blur-sm shadow-[0_1px_3px_rgba(0,0,0,0.02)] z-10 shrink-0">
        <div className="flex items-center space-x-2.5">
          {/* Single Sidebar Toggle / Mobile Menu button */}
          {(onOpenMobileMenu || onToggleSidebar) && (
            <button
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  onOpenMobileMenu?.();
                } else {
                  onToggleSidebar?.();
                }
              }}
              className="p-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-cream-200 dark:hover:bg-charcoal-800 focus-visible:ring-2 focus-visible:ring-warmorange-400/40 outline-none transition"
              title={isSidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Toggle sidebar"}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15"></div>
          <div>
            <h2 className="font-semibold text-stone-800 dark:text-stone-100 text-sm tracking-tight truncate max-w-[180px] sm:max-w-xs md:max-w-md">
              {conversationTitle}
            </h2>
          </div>
        </div>

        {/* Right side controls: Share & Settings */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 text-stone-500">
          <button
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-charcoal-800 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition text-xs font-medium"
            title="Share conversation link"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span className="hidden sm:inline">Share</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-charcoal-800 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 transition"
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Messages Scroll Thread — Single Centered Column (768px, ChatGPT / Claude style) */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          className="h-full overflow-y-auto px-4 sm:px-6 py-8"
        >
        <div className="max-w-3xl mx-auto space-y-8">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12 px-4 select-none">
            {/* 3D Living & Breathing Morphing Glassy Orb */}
            <div className="mb-6 flex items-center justify-center">
              <ThreeOrb />
            </div>

            {/* Time-aware Greeting Header */}
            <div className="space-y-2">
              <h1 className="font-serif font-light text-xl sm:text-2xl md:text-4xl text-stone-900 dark:text-stone-100 tracking-tight leading-snug select-text">
                {getGreeting()}
              </h1>
              <p className="font-sans text-stone-400 dark:text-stone-500 text-xs sm:text-sm font-normal tracking-wide">
                How can I help you today?
              </p>
            </div>

            {/* Clickable suggestion chips (fill the input) */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    textareaRef.current?.focus();
                  }}
                  className="px-3.5 py-2 text-xs rounded-full border border-cream-300 dark:border-charcoal-750 bg-white/70 dark:bg-charcoal-850/70 text-stone-600 dark:text-stone-300 hover:border-warmorange-400 hover:text-warmorange-600 dark:hover:text-warmorange-400 focus-visible:border-warmorange-400 focus-visible:ring-2 focus-visible:ring-warmorange-400/40 outline-none transition shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            const hasSteps = msg.toolSteps && msg.toolSteps.length > 0;
            const isExpanded = expandedMessageIds[msg.id];
            const isLast = idx === messages.length - 1;
            const isEditing = editingMessageId === msg.id;

            // Waiting for the assistant's first tokens → subtle thinking dots
            const isWaiting = isStreaming && isLast && !isUser && !msg.content && !hasSteps;
            if (isWaiting) {
              return <ThinkingIndicator key={msg.id} />;
            }

            return (
              <div
                key={msg.id}
                className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}
              >
                {/* User message — right-aligned soft neutral bubble, no avatar */}
                {isUser && (
                  <div className="flex flex-col items-end">
                    {isEditing ? (
                      <div className="w-full max-w-[75%]">
                        <textarea
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              submitEdit(msg.id);
                            } else if (e.key === "Escape") {
                              cancelEdit();
                            }
                          }}
                          rows={Math.min(6, editDraft.split("\n").length + 1)}
                          className="w-full bg-white dark:bg-charcoal-800 border border-warmorange-400/60 focus:ring-2 focus:ring-warmorange-400/20 rounded-2xl px-4 py-3 text-sm text-stone-800 dark:text-stone-100 outline-none resize-none leading-relaxed"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1.5 text-xs rounded-full border border-cream-300 dark:border-charcoal-750 text-stone-600 dark:text-stone-300 hover:bg-cream-200 dark:hover:bg-charcoal-750 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => submitEdit(msg.id)}
                            disabled={!editDraft.trim()}
                            className="px-3.5 py-1.5 text-xs rounded-full bg-warmorange-500 hover:bg-warmorange-600 disabled:opacity-40 disabled:hover:bg-warmorange-500 text-white font-medium transition"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[85%] sm:max-w-[75%] w-fit bg-stone-200 dark:bg-charcoal-800 text-stone-800 dark:text-stone-100 rounded-3xl rounded-br-lg px-4 sm:px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm" style={{ wordBreak: "break-word" }}>
                        {(() => {
                          const match = msg.content.match(/^<attachment filename="([^"]+)">\n([\s\S]*?)\n<\/attachment>\n([\s\S]*)$/);
                          if (match) {
                            return (
                              <>
                                <div className="flex items-center gap-2 mb-2 bg-stone-300/50 dark:bg-charcoal-700/50 px-3 py-2 rounded-xl text-xs font-medium border border-stone-300 dark:border-charcoal-700">
                                  <svg className="w-4 h-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="truncate max-w-[200px]">{match[1]}</span>
                                </div>
                                {match[3]}
                              </>
                            );
                          }
                          return msg.content;
                        })()}
                      </div>
                    )}

                    {/* Hover actions (always visible on touch devices) */}
                    {!isStreaming && !isEditing && (
                      <div className="mt-1 flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <MessageAction
                          title={copiedId === msg.id ? "Copied!" : "Copy"}
                          onClick={() => copyText(msg.id, msg.content)}
                        >
                          {copiedId === msg.id ? CheckIcon : CopyIcon}
                        </MessageAction>
                        <MessageAction title="Edit message" onClick={() => startEdit(msg)}>
                          {PencilIcon}
                        </MessageAction>
                      </div>
                    )}
                  </div>
                )}

                {/* Assistant message — plain text directly on the page background, full column width */}
                {!isUser && (
                  <div className="w-full min-w-0 space-y-2">
                    {/* Collapsible Reasoning Steps */}
                    {hasSteps && (
                      <div>
                        <button
                          onClick={() => toggleSteps(msg.id)}
                          className="text-[11px] font-mono text-warmorange-600 hover:text-warmorange-500 bg-cream-200/90 dark:bg-charcoal-800/90 hover:bg-cream-300 dark:hover:bg-charcoal-750 border border-cream-300 dark:border-charcoal-750 rounded-md px-2.5 py-1 flex items-center space-x-1.5 transition shadow-2xs"
                        >
                          <span>{isExpanded ? "▼" : "▶"}</span>
                          <span>
                            {msg.toolSteps?.length} reasoning step{msg.toolSteps && msg.toolSteps.length > 1 ? "s" : ""}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-warmorange-400/40">
                            {msg.toolSteps?.map((step, stepIdx) => (
                              <div
                                key={stepIdx}
                                className="bg-charcoal-900 border border-stone-800 rounded-lg p-2.5 text-xs font-mono text-stone-300 shadow-sm"
                              >
                                <div className="flex items-center space-x-2 text-warmorange-400 font-semibold text-[10px]">
                                  <span>⚙ {step.tool.toUpperCase()}</span>
                                  {step.status && <span className="text-stone-400">• {step.status}</span>}
                                </div>
                                {step.output && (
                                  <div className="mt-1.5 text-[11px] text-stone-300 bg-charcoal-950 p-2 rounded border border-stone-800">
                                    {step.output}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline Error Banner or Normal Formatted Markdown Content */}
                    {msg.content.startsWith("⚠️") ? (
                      <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-sm">⚠️</span>
                          <span>{msg.content.replace(/^⚠️\s*/, "")}</span>
                        </div>
                        {onRegenerate && (
                          <button
                            onClick={() => onRegenerate(msg.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-xs shrink-0 transition flex items-center gap-1.5 shadow-xs"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Try Again</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className={isStreaming && isLast ? "streaming" : undefined}>
                        <FormattedContent content={msg.content} />
                      </div>
                    )}

                    {/* Hover actions: Copy / Regenerate / thumbs (always visible on touch devices) */}
                    {!isStreaming && (
                      <div className="flex items-center gap-0.5 -ml-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <MessageAction
                          title={copiedId === msg.id ? "Copied!" : "Copy"}
                          onClick={() => copyText(msg.id, msg.content)}
                        >
                          {copiedId === msg.id ? CheckIcon : CopyIcon}
                        </MessageAction>
                        {onRegenerate && (
                          <MessageAction title="Regenerate response" onClick={() => onRegenerate(msg.id)}>
                            {RefreshIcon}
                          </MessageAction>
                        )}
                        <MessageAction
                          title="Good response"
                          active={feedback[msg.id] === "up"}
                          onClick={() => toggleFeedback(msg.id, "up")}
                        >
                          {ThumbUpIcon}
                        </MessageAction>
                        <MessageAction
                          title="Bad response"
                          active={feedback[msg.id] === "down"}
                          onClick={() => toggleFeedback(msg.id, "down")}
                        >
                          {ThumbDownIcon}
                        </MessageAction>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Real-time active step indicator pill */}
        {activeToolStep && (
          <div className="flex items-start">
            <div className="bg-charcoal-900 text-warmorange-400 border border-warmorange-500/30 rounded-full px-3.5 py-1.5 text-xs font-mono flex items-center space-x-2 animate-pulse shadow-sm">
              <span className="w-2 h-2 rounded-full bg-warmorange-400 animate-ping"></span>
              <span>
                {activeToolStep.status || `Executing ${activeToolStep.tool}...`}
              </span>
            </div>
          </div>
        )}

        {/* Memory confirmation card */}
        {pendingMemory && !isStreaming && onSaveMemory && onDiscardMemory && (
          <MemoryPromptCard
            fact={pendingMemory.fact}
            category={pendingMemory.category}
            conversationId={pendingMemory.conversationId}
            onSave={onSaveMemory}
            onDiscard={onDiscardMemory}
          />
        )}
        </div>
      </div>

      {/* Floating scroll-to-bottom button (appears when scrolled up) */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-white dark:bg-charcoal-800 border border-cream-300 dark:border-charcoal-750 shadow-lg text-stone-500 dark:text-stone-300 hover:text-warmorange-500 dark:hover:text-warmorange-400 flex items-center justify-center transition animate-pop-in"
          title="Scroll to bottom"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
      </div>

      {/* Input Bar Area at Bottom */}
      <div className="p-3 sm:p-4 pt-2 bg-gradient-to-t from-cream-100 dark:from-charcoal-900 via-cream-100/90 dark:via-charcoal-900/90 to-transparent shrink-0">
        <div className="max-w-3xl mx-auto">
          {/* Model selector (small, just above the input) */}
          <div className="relative inline-block mb-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setModelMenuOpen((v) => !v);
              }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 bg-cream-50 dark:bg-charcoal-850 border border-cream-300 dark:border-charcoal-750 rounded-full px-3 py-1.5 transition select-none"
              title="Choose model"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              {activeModel?.label || "Aide Flash"}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {modelMenuOpen && (
              <div className="absolute bottom-full mb-1.5 left-0 w-60 bg-white dark:bg-charcoal-900 border border-cream-300 dark:border-charcoal-800 rounded-xl shadow-xl p-1.5 z-20 animate-pop-in">
                {MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onModelChange?.(opt.id);
                      setModelMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition ${
                      model === opt.id
                        ? "bg-cream-100 dark:bg-charcoal-800 text-stone-900 dark:text-stone-100"
                        : "text-stone-600 dark:text-stone-300 hover:bg-cream-100 dark:hover:bg-charcoal-850"
                    }`}
                  >
                    <span className="flex flex-col items-start">
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-[10px] text-stone-400 dark:text-stone-500">{opt.hint}</span>
                    </span>
                    {model === opt.id && (
                      <svg className="w-3.5 h-3.5 text-warmorange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto-growing composer (Enter to send, Shift+Enter for newline) */}
          <div className="flex flex-col bg-white dark:bg-charcoal-800 border border-cream-300 dark:border-charcoal-750 focus-within:border-warmorange-400 focus-within:ring-2 focus-within:ring-warmorange-400/20 rounded-3xl shadow-sm transition overflow-hidden">
            
            {/* File attachment preview chip */}
            {(attachedFile || isUploading || uploadError) && (
              <div className="flex items-center px-4 pt-3 pb-1 gap-2">
                {uploadError ? (
                  <div className="flex items-center bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg text-[11px] font-medium">
                    <span>⚠️ {uploadError}</span>
                  </div>
                ) : isUploading ? (
                  <div className="flex items-center bg-cream-100 dark:bg-charcoal-750 text-stone-600 dark:text-stone-300 px-3 py-1.5 rounded-lg text-[11px] font-medium">
                    <span className="w-3 h-3 border-2 border-stone-400 border-t-transparent rounded-full animate-spin mr-2" />
                    Reading document...
                  </div>
                ) : attachedFile ? (
                  <div className="flex items-center bg-cream-100 dark:bg-charcoal-750 text-stone-700 dark:text-stone-200 px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-200 dark:border-charcoal-700">
                    <svg className="w-3.5 h-3.5 mr-1.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="truncate max-w-[150px] sm:max-w-[200px]">{attachedFile.name}</span>
                    <button
                      onClick={() => setAttachedFile(null)}
                      className="ml-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition"
                      title="Remove file"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex items-end space-x-2 px-3.5 sm:px-4 py-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileUpload}
              />
              {/* Attachment icon */}
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-50 transition p-1 shrink-0"
                title="Attach file (PDF, DOCX, TXT)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {/* Text input (auto-grows to ~6 lines) */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Aide anything..."
                rows={1}
                disabled={isStreaming}
                className="flex-1 bg-transparent text-xs sm:text-sm text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 outline-none resize-none overflow-y-auto max-h-[140px] py-1.5 leading-relaxed"
              />

              {/* Send / Stop button */}
              {isStreaming ? (
                <button
                  onClick={() => onStop?.()}
                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-stone-200 dark:bg-charcoal-750 hover:bg-stone-300 dark:hover:bg-charcoal-800 text-stone-700 dark:text-stone-200 flex items-center justify-center transition shadow-sm shrink-0"
                  title="Stop generating"
                >
                  <span className="w-2.5 h-2.5 bg-current rounded-[2px]" />
                </button>
              ) : (
                <button
                  onClick={handleCustomSend}
                  disabled={(!input.trim() && !attachedFile) || isUploading}
                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-warmorange-500 hover:bg-warmorange-600 disabled:opacity-40 disabled:hover:bg-warmorange-500 text-white flex items-center justify-center transition shadow-sm shrink-0"
                  title="Send message"
                >
                  <svg className="w-4 h-4 translate-x-px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-stone-400 dark:text-stone-500 text-center mt-2 select-none">
            Aide can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}

