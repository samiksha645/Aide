# Security Architecture & Safeguards for Aide

## Overview
Aide is built with a zero-trust per-user data isolation model. It safely handles sensitive user memories, rate limits high-cost operations, and sandboxes tool execution.

---

## 1. Per-User Data Isolation
- **Mechanism**: Every query touching `User`, `Conversation`, `Message`, or `Memory` is forced through `getScopedDb(userId)` in [src/lib/scoped.ts](file:///c:/Users/HP/Desktop/Aide/src/lib/scoped.ts).
- **Guarantee**: Handlers cannot query records without implicitly binding `where: { userId }`, preventing accidental cross-tenant data leaks.

---

## 2. Application-Layer Memory Encryption
- **Algorithm**: AES-256-GCM symmetric encryption using Node `crypto` (`encryptMemoryContent` / `decryptMemoryContent` in [src/lib/memory.ts](file:///c:/Users/HP/Desktop/Aide/src/lib/memory.ts)).
- **Protection**: Text memories stored in Postgres are encrypted at rest. Compromised database backups or unauthorized SQL reads will not expose raw sensitive facts.

---

## 3. Rate Limiting & Cost Safeguards
- **Chat Endpoint**: 60 messages/hour per user using Upstash Redis sliding window (`chatRateLimiter`).
- **Web Search Tool**: 30 searches/24 hours per user (`webSearchRateLimiter`).
- **ReAct Loop Capping**: Maximum 3 tool executions per turn (`MAX_TOOL_CALLS = 3`) to prevent recursive runaways.

---

## 4. Input Validation & Tool Sandboxing
- **Zod Schemas**: Strict schema validation ([src/lib/validation.ts](file:///c:/Users/HP/Desktop/Aide/src/lib/validation.ts)) enforced across all API endpoints.
- **Calculator Tool**: Evaluated using a custom recursive-descent parser (`safeCalculate` in [src/lib/tools.ts](file:///c:/Users/HP/Desktop/Aide/src/lib/tools.ts)). JavaScript `eval()` and `Function()` constructors are completely avoided to eliminate remote code execution (RCE) vectors.
