export const SPEECH_SEGMENT_LENGTH = 1400;
export const SPEECH_VOICE = "onyx";

export function speechInstructions(language: "ur" | "en") {
  return language === "ur"
    ? "Use a deep, natural adult male voice. Speak in clear Pakistani Urdu at a calm storytelling pace. Pronounce Arabic and Islamic names respectfully and accurately. Do not use a feminine voice."
    : "Use a deep, natural adult male voice. Speak in clear English at a calm storytelling pace. Pronounce Arabic and Islamic names respectfully and accurately. Do not use a feminine voice.";
}

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

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function combinePcmBuffers(buffers: ArrayBuffer[], sampleRate = 24000) {
  if (!buffers.length) throw new Error("No speech audio was returned.");
  if (buffers.some(buffer => buffer.byteLength === 0 || buffer.byteLength % 2 !== 0)) {
    throw new Error("Speech service returned invalid PCM audio.");
  }
  const dataLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  const channels = 1, bitsPerSample = 16, blockAlign = channels * bitsPerSample / 8;
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);
  let outputOffset = 44;
  for (const buffer of buffers) {
    bytes.set(new Uint8Array(buffer), outputOffset);
    outputOffset += buffer.byteLength;
  }
  return output;
}
