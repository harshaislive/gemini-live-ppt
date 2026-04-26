import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NARRATION_CHUNKS, getPromptAnswerAction } from "./presentationScript";

function readWavDurationSeconds(audioUrl: string) {
  const audioPath = path.join(process.cwd(), "public", audioUrl);
  const buffer = readFileSync(audioPath);
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataSize = buffer.readUInt32LE(40);
  return dataSize / (sampleRate * channels * (bitsPerSample / 8));
}

describe("narration audio metadata", () => {
  it("keeps declared chunk durations aligned with committed wav files", () => {
    for (const chunk of NARRATION_CHUNKS) {
      const actualDuration = readWavDurationSeconds(chunk.audioUrl);
      expect(Math.abs(chunk.durationSeconds - actualDuration), chunk.id).toBeLessThanOrEqual(0.25);
    }
  });
});

describe("prompt answer routing", () => {
  it("routes final next-step answers into deterministic actions", () => {
    expect(getPromptAnswerAction("next-step", "Take the trial stay")).toBe("show_trial_cta");
    expect(getPromptAnswerAction("next-step", "Receive more updates")).toBe("open_updates");
    expect(getPromptAnswerAction("next-step", "Understand membership")).toBe("replay_membership");
    expect(getPromptAnswerAction("next-step", "Not right now")).toBe("soft_close");
  });

  it("keeps earlier modal answers in the narration path", () => {
    expect(getPromptAnswerAction("opening-fit", "Access without ownership")).toBe("continue");
    expect(getPromptAnswerAction("proof-fit", "Trying Blyton first")).toBe("continue");
  });
});
