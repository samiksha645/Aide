import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

// POST /api/auth/register - Register a new user
export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: "Valid email and a password of at least 6 characters are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        hashedPassword,
      },
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}
