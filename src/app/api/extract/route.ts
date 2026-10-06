import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import mammoth from "mammoth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Check size limit
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File is too large (max 10 MB)" },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let extractedText = "";

    const mimeType = file.type;
    const fileName = file.name.toLowerCase();

    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      // --- PDF extraction using unpdf ---
      try {
        const { extractText } = await import("unpdf");
        const result = await extractText(new Uint8Array(buffer));
        // result.text is an array of strings (one per page)
        extractedText = Array.isArray(result.text)
          ? result.text.join("\n\n")
          : String(result.text);
      } catch (err) {
        console.error("PDF parse error:", err);
        return NextResponse.json(
          { error: "Failed to read PDF — the file may be corrupted or password-protected." },
          { status: 422 }
        );
      }
    } else if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      // --- DOCX extraction using mammoth ---
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } catch (err) {
        console.error("DOCX parse error:", err);
        return NextResponse.json(
          { error: "Failed to read DOCX — the file may be corrupted." },
          { status: 422 }
        );
      }
    } else if (mimeType === "text/plain" || fileName.endsWith(".txt")) {
      // --- Plain text ---
      extractedText = buffer.toString("utf-8");
    } else {
      return NextResponse.json(
        {
          error: `Unsupported file type. Please upload a PDF, DOCX, or TXT file.`,
        },
        { status: 415 }
      );
    }

    // Trim extracted text
    extractedText = extractedText.trim();
    if (!extractedText) {
      return NextResponse.json(
        { error: "The file contains no readable text." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      text: extractedText,
      fileName: file.name,
    });
  } catch (err) {
    console.error("File extraction error:", err);
    return NextResponse.json(
      { error: "Something went wrong while processing the file." },
      { status: 500 }
    );
  }
}
