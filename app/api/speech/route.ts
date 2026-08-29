import { NextRequest, NextResponse } from "next/server";

const SPEECH_CHUNK_LENGTH = 4000;
type Language = "ur" | "en";
type WavChunk = { sampleRate:number; channels:number; bitsPerSample:number; audioFormat:number; data:Uint8Array };

function splitTextForSpeech(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentences = normalized.match(/[^.!?۔؟]+[.!?۔؟]+|[^.!?۔؟]+$/gu) ?? [normalized];
  const chunks: string[] = [];
  let current = "";
  const append = (part: string) => {
    if (!part) return;
    if (part.length > SPEECH_CHUNK_LENGTH) {
      for (const word of part.split(/\s+/)) appendWord(word);
      return;
    }
    const next = current ? `${current} ${part}` : part;
    if (next.length <= SPEECH_CHUNK_LENGTH) {
      current = next;
      return;
    }
    if (current) chunks.push(current);
    current = part;
  };
  const appendWord = (word: string) => {
    if (word.length > SPEECH_CHUNK_LENGTH) {
      if (current) chunks.push(current);
      for (let index = 0; index < word.length; index += SPEECH_CHUNK_LENGTH) {
        chunks.push(word.slice(index, index + SPEECH_CHUNK_LENGTH));
      }
      current = "";
      return;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length <= SPEECH_CHUNK_LENGTH) current = next;
    else {
      if (current) chunks.push(current);
      current = word;
    }
  };
  for (const sentence of sentences) append(sentence.trim());
  if (current) chunks.push(current);
  return chunks;
}

function ascii(view: DataView, offset: number, length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index));
  return value;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function parseWav(buffer: ArrayBuffer): WavChunk {
  const view = new DataView(buffer);
  if (ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE") throw new Error("Speech service returned invalid WAV audio.");
  let offset = 12, format: Omit<WavChunk, "data"> | null = null, data: Uint8Array | null = null;
  while (offset + 8 <= view.byteLength) {
    const id = ascii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        bitsPerSample: view.getUint16(start + 14, true),
      };
    } else if (id === "data") data = new Uint8Array(buffer, start, size);
    offset = start + size + size % 2;
  }
  if (!format || !data) throw new Error("Speech service returned incomplete WAV audio.");
  if (format.audioFormat !== 1) throw new Error("Speech service returned unsupported WAV audio.");
  return { ...format, data };
}

function combineWavBuffers(buffers: ArrayBuffer[]) {
  const chunks = buffers.map(parseWav);
  const first = chunks[0];
  for (const chunk of chunks) {
    if (chunk.audioFormat !== first.audioFormat || chunk.channels !== first.channels || chunk.sampleRate !== first.sampleRate || chunk.bitsPerSample !== first.bitsPerSample) {
      throw new Error("Speech chunks used incompatible audio formats.");
    }
  }
  const dataLength = chunks.reduce((sum, chunk) => sum + chunk.data.byteLength, 0);
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  const blockAlign = first.channels * first.bitsPerSample / 8;
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, first.audioFormat, true);
  view.setUint16(22, first.channels, true);
  view.setUint32(24, first.sampleRate, true);
  view.setUint32(28, first.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, first.bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (const chunk of chunks) {
    bytes.set(chunk.data, offset);
    offset += chunk.data.byteLength;
  }
  return output;
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
      voice: language === "ur" ? "marin" : "cedar",
      input,
      instructions: language === "ur"
        ? "Speak in clear, natural Pakistani Urdu at a calm storytelling pace. Pronounce Arabic and Islamic names respectfully and accurately."
        : "Speak in clear, natural English at a calm storytelling pace. Pronounce Arabic and Islamic names respectfully and accurately.",
      response_format: "wav",
    }),
  });
}

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

  if (!text || !language) {
    return NextResponse.json(
      { error: "Text and language are required." },
      { status: 400 },
    );
  }

  const chunks = splitTextForSpeech(text);
  const audioBuffers: ArrayBuffer[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const response = await createSpeechChunk(apiKey, language, chunk);
    if (!response.ok) {
      const detail = await response.text();
      console.error("[speech] OpenAI request failed", response.status, `chunk ${index + 1}/${chunks.length}`, detail);
      return NextResponse.json(
        { error: "Speech could not be generated." },
        { status: 502 },
      );
    }
    audioBuffers.push(await response.arrayBuffer());
  }

  let audio: ArrayBuffer;
  try {
    audio = audioBuffers.length === 1 ? audioBuffers[0] : combineWavBuffers(audioBuffers);
  } catch (error) {
    console.error("[speech] WAV assembly failed", error);
    return NextResponse.json(
      { error: "Speech could not be assembled." },
      { status: 502 },
    );
  }

  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "private, max-age=3600",
      "X-Speech-Chunks": String(chunks.length),
    },
  });
}
