import type { LiveServerMessage } from "@google/genai";

export type QueuedAudioChunk = {
  url: string;
  subtitle: string;
};

export function toWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function takeLastWords(text: string, maxWords: number) {
  const words = toWords(text);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return words.slice(-maxWords).join(" ");
}

export function mergeRollingWords(previous: string, next: string, maxWords: number) {
  const nextWords = toWords(next);
  if (nextWords.length === 0) {
    return previous;
  }
  if (nextWords.length >= maxWords) {
    return nextWords.slice(-maxWords).join(" ");
  }

  const previousWords = toWords(previous);
  const maxOverlap = Math.min(previousWords.length, nextWords.length);
  let overlap = 0;

  for (let size = maxOverlap; size > 0; size -= 1) {
    const previousTail = previousWords.slice(-size).join(" ").toLowerCase();
    const nextHead = nextWords.slice(0, size).join(" ").toLowerCase();
    if (previousTail === nextHead) {
      overlap = size;
      break;
    }
  }

  return [...previousWords, ...nextWords.slice(overlap)].slice(-maxWords).join(" ");
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function pcmToWav(pcmBytes: Uint8Array, sampleRate = 24000, numChannels = 1) {
  const buffer = new ArrayBuffer(44 + pcmBytes.length);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcmBytes.length, true);
  new Uint8Array(buffer, 44).set(pcmBytes);
  return new Blob([buffer], { type: "audio/wav" });
}

function isPcmMimeType(mimeType: string) {
  const lower = mimeType.toLowerCase();
  return lower.startsWith("audio/pcm") || lower.startsWith("audio/l16");
}

export function audioBlobFromMessage(message: LiveServerMessage) {
  const inlinePart = message.serverContent?.modelTurn?.parts?.find(
    (part) => part.inlineData?.data && part.inlineData?.mimeType?.startsWith("audio/"),
  );

  const data = inlinePart?.inlineData?.data || message.data;
  const mimeType = inlinePart?.inlineData?.mimeType || "audio/pcm";
  if (!data) {
    return null;
  }

  const bytes = base64ToBytes(data);
  if (isPcmMimeType(mimeType)) {
    return pcmToWav(bytes);
  }

  return new Blob([bytes], { type: mimeType });
}

export function queueAudioChunk(
  queue: QueuedAudioChunk[],
  url: string,
  subtitle: string,
) {
  queue.push({ url, subtitle });
  return queue;
}
