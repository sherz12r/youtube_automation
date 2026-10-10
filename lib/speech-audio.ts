export const SPEECH_SEGMENT_LENGTH = 1400;

type WavChunk = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  audioFormat: number;
  data: Uint8Array;
};

export function splitTextForSpeech(text: string, maxLength = SPEECH_SEGMENT_LENGTH) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?۔؟]+[.!?۔؟]+|[^.!?۔؟]+$/gu) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  const appendWord = (word: string) => {
    if (word.length > maxLength) {
      if (current) chunks.push(current);
      for (let index = 0; index < word.length; index += maxLength) chunks.push(word.slice(index, index + maxLength));
      current = "";
      return;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength) current = next;
    else {
      if (current) chunks.push(current);
      current = word;
    }
  };

  const append = (part: string) => {
    if (!part) return;
    if (part.length > maxLength) {
      for (const word of part.split(/\s+/)) appendWord(word);
      return;
    }
    const next = current ? `${current} ${part}` : part;
    if (next.length <= maxLength) current = next;
    else {
      if (current) chunks.push(current);
      current = part;
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
  if (view.byteLength < 44 || ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE") {
    throw new Error("Speech service returned invalid WAV audio.");
  }
  let offset = 12, format: Omit<WavChunk, "data"> | null = null, data: Uint8Array | null = null;
  while (offset + 8 <= view.byteLength) {
    const id = ascii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > view.byteLength) throw new Error("Speech service returned incomplete WAV audio.");
    if (id === "fmt ") {
      if (size < 16) throw new Error("Speech service returned invalid WAV audio.");
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

export function combineWavBuffers(buffers: ArrayBuffer[]) {
  if (!buffers.length) throw new Error("No speech audio was returned.");
  const chunks = buffers.map(parseWav);
  const first = chunks[0];
  for (const chunk of chunks) {
    if (chunk.audioFormat !== first.audioFormat || chunk.channels !== first.channels || chunk.sampleRate !== first.sampleRate || chunk.bitsPerSample !== first.bitsPerSample) {
      throw new Error("Speech segments used incompatible audio formats.");
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
  let outputOffset = 44;
  for (const chunk of chunks) {
    bytes.set(chunk.data, outputOffset);
    outputOffset += chunk.data.byteLength;
  }
  return output;
}
