import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

// POST /api/auth/demo-guest - Auto-create & return credentials for guest user in DEMO_MODE
export async function POST() {
  if (!isDemoMode()) {
    return NextResponse.json({ error: "Demo mode is not enabled." }, { status: 403 });
  }

  try {
    const guestEmail = `guest_${Date.now()}@aide.demo`;
    const guestPassword = `demo_${Date.now()}`;
    const hashedPassword = await hashPassword(guestPassword);

    const user = await db.user.create({
      data: {
        email: guestEmail,
        hashedPassword,
      },
    });

    return NextResponse.json({
      email: user.email,
      password: guestPassword,
    });
  } catch (err) {
    console.error("Demo guest creation error:", err);
    return NextResponse.json({ error: "Failed to create demo session." }, { status: 500 });
  }
}
