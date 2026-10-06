import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/authOptions";
import { getScopedDb } from "@/lib/scoped";
import { encryptMemoryContent, resolveMemoryCategory } from "@/lib/memory";

interface RouteParams {
  params: { id: string };
}

// PATCH /api/memories/[id] - Edit the content (and re-infer the category) of a memory
export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { content, category } = body as { content?: unknown; category?: unknown };

  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const userDb = getScopedDb(session.user.id);
  const existing = await userDb.memories.findUnique(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }

  const trimmed = content.trim();
  // Re-encrypt the edited text; re-derive the bucket unless an explicit one is given.
  const memoryType = resolveMemoryCategory(category ?? undefined, trimmed);
  const data: Prisma.MemoryUpdateInput = {
    content: encryptMemoryContent(trimmed),
    memoryType,
  };
  await userDb.memories.update(params.id, data);

  return NextResponse.json({
    success: true,
    memory: { id: params.id, content: trimmed, memoryType },
  });
}

// DELETE /api/memories/[id] - Delete specific user memory
export async function DELETE(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDb = getScopedDb(session.user.id);
  await userDb.memories.delete(params.id);

  return NextResponse.json({ success: true });
}
