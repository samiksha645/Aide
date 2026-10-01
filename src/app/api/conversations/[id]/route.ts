import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getScopedDb } from "@/lib/scoped";
import { db } from "@/lib/db";

interface RouteParams {
  params: { id: string };
}

// GET /api/conversations/[id] - Fetch single conversation with messages
export async function GET(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDb = getScopedDb(session.user.id);
  const conversation = await userDb.conversations.findUnique(params.id, true);

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}

// PATCH /api/conversations/[id] - Rename conversation and/or toggle pin
export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const data: { title?: string; pinned?: boolean; archived?: boolean } = {};

  if (typeof body.title === "string") {
    if (!body.title.trim()) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    data.title = body.title.trim();
  }
  if (typeof body.pinned === "boolean") {
    data.pinned = body.pinned;
  }
  if (typeof body.archived === "boolean") {
    data.archived = body.archived;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const userDb = getScopedDb(session.user.id);
  const existing = await userDb.conversations.findUnique(params.id);

  if (!existing) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const updated = await db.conversation.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ conversation: updated });
}

// DELETE /api/conversations/[id] - Delete conversation
export async function DELETE(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDb = getScopedDb(session.user.id);
  await userDb.conversations.delete(params.id);

  return NextResponse.json({ success: true });
}
