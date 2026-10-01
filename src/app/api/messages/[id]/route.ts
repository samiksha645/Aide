import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getScopedDb } from "@/lib/scoped";

interface RouteParams {
  params: { id: string };
}

// DELETE /api/messages/[id]
// Truncate-from-point: deletes the message and every message after it in the
// same conversation. Powers "Regenerate" (truncate the assistant reply) and
// "Edit" (truncate the user message + its replies, then resubmit).
// The scoped helper verifies the message's conversation belongs to the caller.
export async function DELETE(req: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDb = getScopedDb(session.user.id);
  const result = await userDb.messages.deleteFrom(params.id);

  if (result.count === 0) {
    // Not found OR owned by another user — same response either way (no info leak)
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: result.count });
}
