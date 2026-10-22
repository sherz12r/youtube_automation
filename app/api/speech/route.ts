import { NextRequest, NextResponse } from "next/server";
import { SPEECH_SEGMENT_LENGTH, SPEECH_VOICE, speechInstructions } from "../../../lib/speech-audio";
import { requireMutationUser } from "../../../lib/auth";

type Language = "ur" | "en";
type ProviderError = { error?: { code?: unknown; message?: unknown; type?: unknown } };

function speechProviderError(status: number, detail: string) {
  let provider: ProviderError = {};
  try { provider = JSON.parse(detail) as ProviderError; }
  catch { /* The status-specific message below remains safe and actionable. */ }
  const code = typeof provider.error?.code === "string" ? provider.error.code : "";
  const message = typeof provider.error?.message === "string" ? provider.error.message : "";
  if (status === 401) return "OpenAI rejected OPENAI_API_KEY. Replace the key, then restart the app.";
  if (status === 403) return "This OpenAI project is not permitted to use text-to-speech. Check the project permissions and model access.";
  if (status === 429 && (code === "insufficient_quota" || /quota|billing/i.test(message))) {
    return "OpenAI text-to-speech quota is unavailable. Check the API project billing and usage limits, then retry.";
  }
  if (status === 429) return "OpenAI text-to-speech is rate limited. Wait briefly, then retry.";
  if (status === 400 && message) return `OpenAI could not create the narration: ${message}`;
  if (status >= 500) return "OpenAI text-to-speech is temporarily unavailable. Please retry shortly.";
  return `OpenAI text-to-speech failed (HTTP ${status}). Check the API project configuration and server log.`;
}

async function createSpeechChunk(apiKey: string, language: Language, input: string) {
  return fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: SPEECH_VOICE,
      input,
      instructions: speechInstructions(language),
      response_format: "pcm",
    }),
    signal: AbortSignal.timeout(120000),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireMutationUser(request);
  if ("response" in auth) return auth.response;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Speech service is not configured. Ensure OPENAI_API_KEY is available to the server runtime, then restart the app." },
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

  if (!text || !language) {
    return NextResponse.json(
      { error: "Text and language are required." },
      { status: 400 },
    );
  }
  if (text.length > SPEECH_SEGMENT_LENGTH) {
    return NextResponse.json(
      { error: `Narration segments must be ${SPEECH_SEGMENT_LENGTH} characters or fewer.` },
      { status: 413 },
    );
  }

  let response: Response;
  try {
    response = await createSpeechChunk(apiKey, language, text);
  } catch (error) {
    console.error("[speech] OpenAI request could not be completed", error);
    return NextResponse.json(
      { error: "The server could not connect to OpenAI text-to-speech. Check outbound HTTPS access and retry." },
      { status: 502 },
    );
  }
  if (!response.ok) {
    const detail = await response.text();
    console.error("[speech] OpenAI request failed", response.status, detail);
    return NextResponse.json(
      { error: speechProviderError(response.status, detail) },
      { status: 502 },
    );
  }
  const audio = await response.arrayBuffer();

  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/pcm",
      "Cache-Control": "private, max-age=3600",
      "X-Speech-Chunks": "1",
      "X-Speech-Voice": SPEECH_VOICE,
      "X-PCM-Sample-Rate": "24000",
    },
  });
}
