import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getScopedDb } from "@/lib/scoped";
import { decryptMemoryContent, encryptMemoryContent, generateEmbedding } from "@/lib/memory";

// GET /api/memories - List all user memories with decrypted content
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDb = getScopedDb(session.user.id);
  const rawMemories = await userDb.memories.findMany({
    orderBy: { createdAt: "desc" },
  });

  const memories = rawMemories.map((m) => ({
    ...m,
    content: decryptMemoryContent(m.content),
  }));

  return NextResponse.json({ memories });
}

// POST /api/memories - Save a user-confirmed memory fact
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { content, conversationId, category } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const userDb = getScopedDb(session.user.id);
  const encrypted = encryptMemoryContent(content.trim());
  const memory = await userDb.memories.create({
    content: encrypted,
    memoryType: category || "fact",
    sourceConversationId: conversationId || null,
  });

  // Fire-and-forget embedding generation
  generateEmbedding(content).catch(() => {});

  return NextResponse.json({ memory: { ...memory, content: content.trim() } });
}
