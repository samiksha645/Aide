import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getScopedDb } from "@/lib/scoped";

// GET /api/conversations - List user conversations
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDb = getScopedDb(session.user.id);
  const conversations = await userDb.conversations.findMany({
    orderBy: { createdAt: "desc" },
    include: { messages: { select: { tokenCount: true, costUsd: true } } },
  });

  // The scoped wrapper erases the included `messages` type — cast like chat/route.ts does
  const withMessages = conversations as unknown as Array<
    { id: string; title: string; pinned?: boolean; createdAt: Date; userId: string } & {
      messages: { tokenCount: number; costUsd: number }[];
    }
  >;

  // Attach per-conversation usage totals for the Settings → Usage tab
  const withUsage = withMessages.map(({ messages, ...conversation }) => ({
    ...conversation,
    tokens: messages.reduce((sum, m) => sum + (m.tokenCount || 0), 0),
    cost: messages.reduce((sum, m) => sum + (m.costUsd || 0), 0),
  }));

  return NextResponse.json({ conversations: withUsage });
}

// POST /api/conversations - Create new conversation
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = body.title || "New conversation";

  const userDb = getScopedDb(session.user.id);
  const conversation = await userDb.conversations.create({ title });

  return NextResponse.json({ conversation });
}
