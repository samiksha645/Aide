# Aide

A general-purpose AI assistant with persistent memory and transparent tool use — built to be secure, production-architected, and deployable entirely on free tiers.

## What makes this different

- **Persistent memory** — extracts and stores durable facts about the user across conversations (not just replayed chat history), retrieved via vector search on each new message.
- **Transparent tool use** — when the assistant searches the web, does a calculation, or saves a reminder, the reasoning is shown to the user step by step, not hidden.
- **Cost-aware by design** — every message tracks token usage and estimated cost; a demo mode serves mocked responses so the live deployed link never racks up API charges unexpectedly.
- **Security-first** — every database query is scoped to the authenticated user through a single shared helper, so cross-user data leaks aren't possible by omission.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router, TypeScript) | Frontend + API routes in one deployable unit |
| Database | PostgreSQL + pgvector (via Supabase free tier) | Relational data + vector search in one place |
| ORM | Prisma | Type-safe queries, easy migrations |
| Auth | Auth.js (NextAuth) | Free, self-hosted, no per-user cost |
| Rate limiting / cache | Upstash Redis (free tier) | Controls tool-call and API cost |
| LLM | Anthropic or OpenAI API | The only paid component — see cost notes below |
| Hosting | Vercel (Hobby plan) | Free, zero-config Next.js deploys |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy the environment template and fill in real values
cp .env.example .env.local

# 3. Push the database schema (requires a Supabase Postgres URL in .env.local)
npx prisma db push

# 4. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

See `.env.example` for the full list. At minimum you need:
- `DATABASE_URL` — your Supabase Postgres connection string
- `NEXTAUTH_SECRET` — a random string (`openssl rand -base64 32`)
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — your LLM provider key
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — for rate limiting

## A note on cost

The only part of this stack that isn't free is LLM API usage. Set a hard spending cap in your provider's console before running this anywhere public. `DEMO_MODE=true` in `.env.local` serves mocked responses instead of calling the real API — keep this on for any publicly shared deployment unless you're actively demoing it live.

## Project structure

```
src/
  app/            → Next.js App Router pages and API routes
  components/     → Reusable UI components
  lib/            → Shared logic: auth, db client, memory, tools
database/
  schema/         → Prisma schema and migrations
```

## Roadmap

This is a Phase 0 scaffold. See the accompanying prompt playbook for the full build sequence: auth, memory pipeline, agent/tool loop, transparency UI, security hardening, and deployment.

## What I'd do with more time

- Swap the throttled memory-extraction heuristic for a smarter relevance model
- Add streaming tool-call results instead of a fixed step sequence
- Add per-tool budget limits, not just a global rate limit
