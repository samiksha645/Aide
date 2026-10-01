import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getScopedDb } from "@/lib/scoped";

interface RouteParams {
  params: { id: string };
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
