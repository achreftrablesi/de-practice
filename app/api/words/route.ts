import { NextRequest, NextResponse } from "next/server";
import { fetchWordBatch, Level } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { level, seenWords, batchSize } = await req.json();

    if (!["A1", "A2", "B1", "B2", "C1"].includes(level)) {
      return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }

    const words = await fetchWordBatch(level as Level, seenWords ?? [], batchSize ?? 10);

    if (words.length === 0) {
      return NextResponse.json(
        { error: "No valid words returned" },
        { status: 500 }
      );
    }

    return NextResponse.json({ words });
  } catch (err) {
    console.error("Gemini error:", err);
    return NextResponse.json(
      { error: "Failed to fetch words" },
      { status: 500 }
    );
  }
}
