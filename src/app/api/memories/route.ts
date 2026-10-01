import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getScopedDb } from "@/lib/scoped";
import { decryptMemoryContent } from "@/lib/memory";

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
