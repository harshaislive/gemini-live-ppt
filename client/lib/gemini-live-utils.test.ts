import { describe, expect, it } from "vitest";
import type { LiveServerMessage } from "@google/genai";
import {
  extractAudioPayloadFromMessage,
  mergeRollingWords,
  parseSampleRateFromMimeType,
  queueAudioChunk,
} from "./gemini-live-utils";

describe("mergeRollingWords", () => {
  it("keeps a rolling non-duplicated subtitle window", () => {
    expect(mergeRollingWords("Start with the", "the smallest real step", 4)).toBe(
      "the smallest real step",
    );
  });
});

describe("audioBlobFromMessage", () => {
  it("extracts pcm mime variants with correct sample rate", async () => {
    const message = {
      serverContent: {
        modelTurn: {
          parts: [
            {
              inlineData: {
                data: "AAAA",
                mimeType: "audio/pcm;rate=24000",
              },
            },
          ],
        },
      },
    } as LiveServerMessage;

    const payload = extractAudioPayloadFromMessage(message);
    expect(payload).not.toBeNull();
    expect(payload?.mimeType).toBe("audio/pcm;rate=24000");
    expect(payload?.sampleRate).toBe(24000);
  });
});

describe("parseSampleRateFromMimeType", () => {
  it("reads sample rate parameters from mime strings", () => {
    expect(parseSampleRateFromMimeType("audio/pcm;rate=24000")).toBe(24000);
    expect(parseSampleRateFromMimeType("audio/l16;sample_rate=16000")).toBe(16000);
    expect(parseSampleRateFromMimeType("audio/pcm")).toBe(24000);
  });
});

describe("queueAudioChunk", () => {
  it("captures the subtitle snapshot at enqueue time", () => {
    const queue = queueAudioChunk([], "blob:1", "quiet proof");
    queueAudioChunk(queue, "blob:2", "real silence");
    expect(queue).toEqual([
      { url: "blob:1", subtitle: "quiet proof" },
      { url: "blob:2", subtitle: "real silence" },
    ]);
  });
});
