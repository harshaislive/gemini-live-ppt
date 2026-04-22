import { describe, expect, it } from "vitest";
import type { LiveServerMessage } from "@google/genai";
import {
  audioBlobFromMessage,
  mergeRollingWords,
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
  it("converts pcm mime variants into wav blobs", async () => {
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

    const blob = audioBlobFromMessage(message);
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe("audio/wav");
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
