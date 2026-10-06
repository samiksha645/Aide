import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Today's start (midnight local → UTC)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // All-time aggregates across user's conversations
  const [allConvs, allMsgs] = await Promise.all([
    db.conversation.findMany({
      where: { userId },
      select: { id: true, createdAt: true },
    }),
    db.message.findMany({
      where: { conversation: { userId } },
      select: { tokenCount: true, costUsd: true, createdAt: true, role: true },
    }),
  ]);

  const totalConversations = allConvs.length;
  const totalMessages = allMsgs.filter((m) => m.role === "user").length;
  const totalTokens = allMsgs.reduce((s, m) => s + (m.tokenCount || 0), 0);
  const totalCost = allMsgs.reduce((s, m) => s + (m.costUsd || 0), 0);

  // Today's stats
  const todayMsgs = allMsgs.filter((m) => new Date(m.createdAt) >= todayStart);
  const todayConvs = allConvs.filter((c) => new Date(c.createdAt) >= todayStart).length;
  const todayTokens = todayMsgs.reduce((s, m) => s + (m.tokenCount || 0), 0);
  const todayCost = todayMsgs.reduce((s, m) => s + (m.costUsd || 0), 0);
  const todayMessages = todayMsgs.filter((m) => m.role === "user").length;

  // 7-day token chart — one bucket per day
  const daily: { date: string; tokens: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayTokens = allMsgs
      .filter((m) => {
        const d = new Date(m.createdAt);
        return d >= dayStart && d < dayEnd;
      })
      .reduce((s, m) => s + (m.tokenCount || 0), 0);

    daily.push({
      date: dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      tokens: dayTokens,
    });
  }

  return NextResponse.json({
    allTime: { totalConversations, totalMessages, totalTokens, totalCost },
    today: { todayConversations: todayConvs, todayMessages, todayTokens, todayCost },
    daily,
  });
}
