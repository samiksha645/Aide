"use client";

import React, { useState, useEffect, useMemo } from "react";
import { signOut } from "next-auth/react";
import { getGroupLabel, GROUP_ORDER } from "@/lib/dateGroups";

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  /** Pin state (persisted per user via PATCH /api/conversations/[id]) */
  pinned?: boolean;
  /** Archive state (persisted per user via PATCH /api/conversations/[id]) */
  archived?: boolean;
  /** Aggregated usage for the Settings → Usage tab (set by /api/conversations) */
  tokens?: number;
  cost?: number;
}

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  /** Toggle the pinned flag (persisted server-side) */
  onTogglePin?: (id: string, pinned: boolean) => void;
  /** Toggle the archived flag (persisted server-side) */
  onToggleArchive?: (id: string, archived: boolean) => void;
  userEmail?: string | null;
  userName?: string | null;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onOpenSettings?: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onTogglePin,
  onToggleArchive,
  userEmail,
  userName,
  isOpenMobile = false,
  onCloseMobile,
  isCollapsed = false,
  onOpenSettings,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showArchivedSection, setShowArchivedSection] = useState(false);

  // Active (unarchived) vs Archived conversations
  const activeConversations = useMemo(
    () => conversations.filter((c) => !c.archived),
    [conversations]
  );
  const archivedConversations = useMemo(
    () => conversations.filter((c) => c.archived),
    [conversations]
  );

  // Active Chats grouped as Pinned → Today → Yesterday → Previous 7 days → Older
  const groupedChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = activeConversations.filter((c) => !q || c.title.toLowerCase().includes(q));
    const pinned = filtered.filter((c) => c.pinned);
    const buckets: Record<string, Conversation[]> = {
      Today: [],
      Yesterday: [],
      "Previous 7 days": [],
      Older: [],
    };
    for (const c of filtered) {
      if (!c.pinned) buckets[getGroupLabel(c.createdAt)].push(c);
    }
    const groups: { label: string; items: Conversation[] }[] = [];
    if (pinned.length > 0) groups.push({ label: "Pinned", items: pinned });
    for (const label of GROUP_ORDER) {
      if (buckets[label].length > 0) groups.push({ label, items: buckets[label] });
    }
    return groups;
  }, [activeConversations, search]);

  const filteredCount = useMemo(
    () => groupedChats.reduce((sum, g) => sum + g.items.length, 0),
    [groupedChats]
  );

  // Close open dropdown menus on outside click or Escape key
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => {
      setOpenMenuId(null);
      setConfirmDeleteId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!showProfileMenu) return;
    const close = () => setShowProfileMenu(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [showProfileMenu]);

  const handleStartEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      onRename(id, editTitle.trim());
    }
    setEditingId(null);
  };

  // Export handlers
  const handleExportMarkdown = async (conv: Conversation) => {
    try {
      const res = await fetch(`/api/conversations/${conv.id}`);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      const messages: { role: string; content: string }[] = data.conversation?.messages || [];

      let md = `# ${conv.title}\n*Exported from Aide on ${new Date().toLocaleDateString()}*\n\n---\n\n`;
      messages.forEach((m) => {
        const roleLabel = m.role === "user" ? "**User:**" : "**Assistant:**";
        md += `${roleLabel}\n${m.content}\n\n`;
      });

      await navigator.clipboard.writeText(md);
      setCopiedId(conv.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to export markdown:", err);
    }
  };

  const handleExportPdf = async (conv: Conversation) => {
    try {
      const res = await fetch(`/api/conversations/${conv.id}`);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      const messages: { role: string; content: string }[] = data.conversation?.messages || [];

      const printWin = window.open("", "_blank");
      if (!printWin) return;

      const formattedMessages = messages
        .map(
          (m) => `
          <div class="msg ${m.role}">
            <div class="role">${m.role === "user" ? "User" : "Aide Assistant"}</div>
            <div class="content">${m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</div>
          </div>
        `
        )
        .join("");

      printWin.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${conv.title}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1c1917; line-height: 1.6; max-width: 800px; margin: 0 auto; }
              h1 { font-size: 24px; border-bottom: 2px solid #e7e5e4; padding-bottom: 8px; margin-bottom: 4px; }
              .meta { font-size: 12px; color: #78716c; margin-bottom: 24px; }
              .msg { margin-bottom: 16px; padding: 14px 18px; border-radius: 12px; }
              .user { background: #f5f5f4; border: 1px solid #e7e5e4; }
              .assistant { background: #fff7ed; border: 1px solid #ffedd5; }
              .role { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
              .user .role { color: #57534e; }
              .assistant .role { color: #ea580c; }
              .content { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
            </style>
          </head>
          <body>
            <h1>${conv.title}</h1>
            <div class="meta">Exported from Aide • ${new Date().toLocaleString()}</div>
            ${formattedMessages}
          </body>
        </html>
      `);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 250);
    } catch (err) {
      console.error("Failed to export PDF:", err);
    }
  };

  const displayUser = userName || userEmail || "Guest User";
  const firstLetter = displayUser.charAt(0).toUpperCase();

  const renderConversationItem = (conv: Conversation) => {
    const isActive = conv.id === activeId;
    const isEditing = conv.id === editingId;
    const isMenuOpen = openMenuId === conv.id;

    if (isCollapsed) {
      return (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={`w-full flex items-center justify-center py-2 rounded-lg text-xs transition focus-visible:ring-2 focus-visible:ring-warmorange-400/40 outline-none ${
            isActive ? "bg-charcoal-850 text-warmorange-400 font-bold" : "text-stone-400 hover:bg-charcoal-900"
          }`}
          title={conv.title}
        >
          {conv.pinned ? "📌" : "💬"}
        </button>
      );
    }

    return (
      <div
        key={conv.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(conv.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(conv.id);
          }
        }}
        className={`group relative flex items-center px-3 py-2 text-xs rounded-lg cursor-pointer transition focus-visible:ring-2 focus-visible:ring-warmorange-400/40 outline-none ${
          isActive
            ? "bg-charcoal-850 text-stone-100 font-medium border-l-2 border-warmorange-500 pl-2.5"
            : "text-stone-400 hover:bg-charcoal-900 hover:text-stone-200"
        }`}
      >
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => handleSaveEdit(conv.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveEdit(conv.id);
              if (e.key === "Escape") setEditingId(null);
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-charcoal-900 border border-warmorange-500 text-stone-100 text-xs rounded px-2 py-0.5 w-full outline-none"
            autoFocus
          />
        ) : (
          <>
            {conv.pinned && (
              <svg className="w-3 h-3 text-warmorange-400 shrink-0 mr-1.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 3v5.06l2.12 2.12a1 1 0 01.29.7V12a1 1 0 01-1 1h-4.4v7.28a.72.72 0 01-1.44 0V13H7.6a1 1 0 01-1-1v-1.12a1 1 0 01.3-.7L9 8.06V3a1 1 0 011-1h5a1 1 0 011 1z" />
              </svg>
            )}
            <span className="truncate pr-2">{conv.title}</span>
          </>
        )}

        {/* ⋯ Button — shown on hover, always accessible on touch */}
        {!isEditing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(isMenuOpen ? null : conv.id);
              setConfirmDeleteId(null);
            }}
            className={`ml-auto p-1 rounded-md text-stone-500 hover:text-stone-200 hover:bg-charcoal-800 focus-visible:text-stone-200 focus-visible:bg-charcoal-800 outline-none transition-opacity shrink-0 ${
              isMenuOpen
                ? "opacity-100"
                : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            }`}
            title="Chat options (⋯)"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
          >
            {/* Horizontal 3 dots (⋯) icon */}
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
          </button>
        )}

        {/* ⋯ Dropdown Menu */}
        {isMenuOpen && !isEditing && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-9 z-50 w-48 bg-charcoal-900 border border-charcoal-750 rounded-xl p-1.5 shadow-2xl animate-pop-in space-y-0.5"
            role="menu"
          >
            {/* Rename */}
            <button
              onClick={() => {
                setOpenMenuId(null);
                handleStartEdit(conv);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-stone-200 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition text-left"
              role="menuitem"
            >
              <svg className="w-3.5 h-3.5 text-stone-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.5 9.828 9 10.5l.672-2.5 4.828-4.828z" />
              </svg>
              <span>Rename</span>
            </button>

            {/* Pin / Unpin */}
            <button
              onClick={() => {
                setOpenMenuId(null);
                onTogglePin?.(conv.id, !conv.pinned);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-stone-200 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition text-left"
              role="menuitem"
            >
              <svg className="w-3.5 h-3.5 text-warmorange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3v5.06l2.12 2.12a1 1 0 01.29.7V12a1 1 0 01-1 1h-4.4v7.28a.72.72 0 01-1.44 0V13H7.6a1 1 0 01-1-1v-1.12a1 1 0 01.3-.7L9 8.06V3a1 1 0 011-1h5a1 1 0 011 1z" />
              </svg>
              <span>{conv.pinned ? "Unpin chat" : "Pin chat"}</span>
            </button>

            {/* Archive / Unarchive */}
            <button
              onClick={() => {
                setOpenMenuId(null);
                onToggleArchive?.(conv.id, !conv.archived);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-stone-200 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition text-left"
              role="menuitem"
            >
              <svg className="w-3.5 h-3.5 text-stone-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span>{conv.archived ? "Unarchive chat" : "Archive chat"}</span>
            </button>

            <div className="my-1 border-t border-charcoal-800" />

            {/* Export as Markdown */}
            <button
              onClick={() => {
                setOpenMenuId(null);
                handleExportMarkdown(conv);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-stone-200 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition text-left"
              role="menuitem"
            >
              <svg className="w-3.5 h-3.5 text-stone-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{copiedId === conv.id ? "Copied Markdown!" : "Copy as Markdown"}</span>
            </button>

            {/* Export as PDF */}
            <button
              onClick={() => {
                setOpenMenuId(null);
                handleExportPdf(conv);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-stone-200 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition text-left"
              role="menuitem"
            >
              <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span>Export as PDF</span>
            </button>

            <div className="my-1 border-t border-charcoal-800" />

            {/* Delete Confirmation */}
            {confirmDeleteId === conv.id ? (
              <>
                <button
                  onClick={() => {
                    setOpenMenuId(null);
                    setConfirmDeleteId(null);
                    onDelete(conv.id);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 focus-visible:bg-red-500/20 outline-none transition text-left font-medium"
                  role="menuitem"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Confirm delete</span>
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-stone-400 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition text-left"
                  role="menuitem"
                >
                  <span>Cancel</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(conv.id)}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-red-400 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition text-left"
                role="menuitem"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-40 md:hidden"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 bg-charcoal-950 text-stone-300 flex flex-col border-r border-charcoal-850 h-full select-none transform transition-all duration-300 ease-in-out ${
          isOpenMobile ? "translate-x-0 shadow-2xl w-72" : "-translate-x-full md:translate-x-0"
        } ${isCollapsed ? "md:w-16" : "md:w-64"}`}
      >
        {/* Brand Header */}
        <div className="p-3 pb-2 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-warmorange-500/15 border border-warmorange-500/30 flex items-center justify-center text-warmorange-400 font-bold text-xs shadow-sm shrink-0">
              AI
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <h1 className="font-semibold text-stone-100 text-sm tracking-tight leading-none">Aide</h1>
                <span className="text-[10px] text-stone-500 tracking-wider uppercase font-medium">Assistant</span>
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-charcoal-850"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* New Chat Button */}
        <div className="px-3 py-2">
          <button
            onClick={onNew}
            className={`w-full flex items-center justify-center space-x-2 bg-charcoal-850 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 focus-visible:ring-2 focus-visible:ring-warmorange-400/40 outline-none text-stone-100 text-xs font-medium py-2.5 px-3 rounded-full border border-stone-800 hover:border-stone-700 transition shadow-sm group ${
              isCollapsed ? "px-0 justify-center" : ""
            }`}
            title="New chat (Ctrl+N)"
          >
            <svg className="w-4 h-4 text-warmorange-400 group-hover:rotate-90 transition-transform duration-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {!isCollapsed && <span>New chat</span>}
          </button>
        </div>

        {/* Search Input */}
        {!isCollapsed && (
          <div className="px-3 pb-1">
            <div className="flex items-center space-x-2 bg-charcoal-900 border border-charcoal-800 focus-within:border-charcoal-750 focus-within:ring-2 focus-within:ring-warmorange-400/20 rounded-lg px-2.5 py-1.5 transition">
              <svg className="w-3.5 h-3.5 text-stone-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                id="aide-search-input"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearch("");
                }}
                placeholder="Search chats...  (Ctrl+K)"
                aria-label="Search chats"
                className="flex-1 min-w-0 bg-transparent text-xs text-stone-200 placeholder-stone-600 outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-stone-500 hover:text-stone-300 focus-visible:text-stone-300 transition shrink-0 outline-none"
                  title="Clear search"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {!isCollapsed && conversations.length === 0 ? (
            <div className="text-stone-600 text-xs text-center py-8 px-4">
              No conversations yet.<br />Click &quot;New chat&quot; to begin.
            </div>
          ) : !isCollapsed && filteredCount === 0 ? (
            <div className="text-stone-600 text-xs text-center py-8 px-4">
              No chats match &ldquo;{search}&rdquo;.
            </div>
          ) : (
            groupedChats.map(({ label, items }) => (
              <div key={label} className="pt-2">
                <div className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-stone-600 uppercase select-none">
                  {label}
                </div>
                {items.map(renderConversationItem)}
              </div>
            ))
          )}

          {/* Archived Chats Collapsible Section */}
          {!isCollapsed && archivedConversations.length > 0 && (
            <div className="pt-4 border-t border-charcoal-850 mt-4">
              <button
                onClick={() => setShowArchivedSection((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold tracking-wider text-stone-500 hover:text-stone-300 uppercase transition select-none"
              >
                <span>Archived ({archivedConversations.length})</span>
                <span className="text-xs">{showArchivedSection ? "▲" : "▼"}</span>
              </button>
              {showArchivedSection && (
                <div className="space-y-0.5 pt-1">
                  {archivedConversations.map(renderConversationItem)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile Footer */}
        <div className="p-2.5 border-t border-charcoal-850 relative">
          {showProfileMenu && (
            <div className="absolute bottom-14 left-2 right-2 bg-charcoal-900 border border-charcoal-750 rounded-xl p-1.5 shadow-2xl z-50 space-y-0.5 text-xs animate-pop-in">
              {onOpenSettings && (
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-stone-200 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition"
                >
                  <svg className="w-4 h-4 text-warmorange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Settings</span>
                </button>
              )}

              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-red-400 hover:bg-charcoal-800 focus-visible:bg-charcoal-800 outline-none transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Log out</span>
              </button>
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowProfileMenu((prev) => !prev);
            }}
            className={`w-full flex items-center justify-between p-2 rounded-xl hover:bg-charcoal-850 focus-visible:bg-charcoal-850 focus-visible:ring-2 focus-visible:ring-warmorange-400/40 outline-none transition text-left ${
              isCollapsed ? "justify-center" : ""
            }`}
            title={displayUser}
          >
            <div className="flex items-center space-x-2.5 truncate">
              <div className="w-7 h-7 rounded-full bg-warmorange-500/20 text-warmorange-400 font-bold text-xs flex items-center justify-center shrink-0 border border-warmorange-500/30">
                {firstLetter}
              </div>
              {!isCollapsed && (
                <div className="truncate">
                  <span className="text-stone-200 font-medium truncate block text-xs leading-tight">
                    {displayUser}
                  </span>
                  <span className="text-[10px] text-stone-500 block truncate">Account</span>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <svg className="w-4 h-4 text-stone-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
