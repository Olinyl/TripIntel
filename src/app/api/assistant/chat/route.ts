import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "edge";

interface Body {
  question?: unknown;
  context?: unknown;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function buildPrompt(question: string, context: UnknownRecord): string {
  const summary = asString(context.summary);
  const issueType = asString(context.issueType, "other");
  const orderSnapshot = context.orderSnapshot;

  return [
    "You are an airline operations-focused assistant for a flight booking app.",
    "Answer the user using only the provided context. If data is missing, say what is missing.",
    "Be specific, concise, and actionable.",
    "When asked about connection feasibility, mention potential risk level and what minimum buffer you would want.",
    "When asked about baggage policy, use any provided policy/brand info. If absent, clearly state that airline fare rules must be checked.",
    "Do not fabricate flight numbers, airport policies, or airline rules.",
    "",
    `Issue type: ${issueType}`,
    `Order summary: ${summary || "n/a"}`,
    `Order snapshot JSON: ${JSON.stringify(orderSnapshot ?? {})}`,
    "",
    `User question: ${question}`,
  ].join("\n");
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_AI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as Body;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "question is required." }, { status: 400 });
    }

    const context = asRecord(body.context);
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: buildPrompt(question, context) }] }],
    });

    const answer = (response.text ?? "").trim();
    if (!answer) {
      return NextResponse.json(
        { error: "Assistant did not return a response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate assistant response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
