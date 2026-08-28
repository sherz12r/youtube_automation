import { NextRequest, NextResponse } from "next/server";

const MAX_TEXT_LENGTH = 4096;

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Speech service is not configured." },
      { status: 503 },
    );
  }

  let body: { text?: unknown; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const language = body.language === "ur" || body.language === "en"
    ? body.language
    : null;

  if (!text || !language || text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text and language are required; text must be at most ${MAX_TEXT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: language === "ur" ? "marin" : "cedar",
      input: text,
      instructions: language === "ur"
        ? "Speak in clear, natural Pakistani Urdu at a calm storytelling pace. Pronounce Arabic and Islamic names respectfully and accurately."
        : "Speak in clear, natural English at a calm storytelling pace. Pronounce Arabic and Islamic names respectfully and accurately.",
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[speech] OpenAI request failed", response.status, detail);
    return NextResponse.json(
      { error: "Speech could not be generated." },
      { status: 502 },
    );
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
