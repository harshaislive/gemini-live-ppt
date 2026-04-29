import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NARRATION_CHUNKS,
  PREPARED_FAQS,
  buildTranscriptWindow,
  getNarrationCaption,
  getPromptAnswerAction,
} from "./presentationScript";

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

describe("narration brand wording", () => {
  it("keeps visible subtitles spelled as Bewild while allowing TTS pronunciation hints", () => {
    const visibleScript = NARRATION_CHUNKS.map((chunk) => chunk.transcript).join(" ");
    const speechScript = NARRATION_CHUNKS.map((chunk) => chunk.speechTranscript || "").join(" ");

    expect(visibleScript).toContain("Bewild");
    expect(visibleScript).not.toContain("Be Wild");
    expect(speechScript).toContain("Be Wild");
  });

  it("frames food as landscape-supported, not universal production", () => {
    const visibleScript = NARRATION_CHUNKS.map((chunk) => chunk.transcript).join(" ");

    expect(visibleScript).toContain("Where the land naturally supports food forests");
    expect(visibleScript).toContain("where the landscape naturally supports it");
    expect(visibleScript).not.toContain("growing food through Bewild");
  });
});

describe("subtitle cue timing", () => {
  it("keeps visible captions short like spoken video captions", () => {
    for (const chunk of NARRATION_CHUNKS) {
      const cue = buildTranscriptWindow(chunk.transcript, chunk.durationSeconds / 2, chunk.durationSeconds);
      expect(cue.split(/\s+/).filter(Boolean).length, chunk.id).toBeLessThanOrEqual(5);
    }
  });

  it("reaches the final words near the end of each audio chunk", () => {
    for (const chunk of NARRATION_CHUNKS) {
      const cue = buildTranscriptWindow(chunk.transcript, chunk.durationSeconds - 0.05, chunk.durationSeconds);
      const finalWord = chunk.transcript.split(/\s+/).filter(Boolean).at(-1);
      expect(cue, chunk.id).toContain(finalWord);
    }
  });

  it("uses committed timed caption cues when available", () => {
    for (const chunk of NARRATION_CHUNKS) {
      expect(chunk.captionCues?.length, chunk.id).toBeGreaterThan(0);
      expect(getNarrationCaption(chunk, 0, chunk.durationSeconds), chunk.id).toBe(chunk.captionCues?.[0]?.text);
    }
  });

  it("keeps timed cues ordered and short", () => {
    for (const chunk of NARRATION_CHUNKS) {
      let previousEnd = 0;
      for (const cue of chunk.captionCues || []) {
        expect(cue.start, chunk.id).toBeGreaterThanOrEqual(previousEnd - 0.01);
        expect(cue.end, chunk.id).toBeGreaterThan(cue.start);
        expect(cue.end, chunk.id).toBeLessThanOrEqual(chunk.durationSeconds + 0.25);
        expect(cue.text.split(/\s+/).filter(Boolean).length, chunk.id).toBeLessThanOrEqual(5);
        previousEnd = cue.end;
      }
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

describe("prepared FAQs", () => {
  it("keeps the FAQ language aligned to person-nights", () => {
    expect(PREPARED_FAQS.length).toBeGreaterThanOrEqual(4);
    expect(PREPARED_FAQS.some((faq) => /person-nights/i.test(`${faq.question} ${faq.answer}`))).toBe(true);
    expect(PREPARED_FAQS.every((faq) => faq.question && faq.answer)).toBe(true);
  });

  it("uses generated FAQ audio files instead of browser speech", () => {
    for (const faq of PREPARED_FAQS) {
      expect(faq.audioUrl, faq.id).toMatch(/^\/audio\/faq\/.+\.wav$/);
      expect(readWavDurationSeconds(faq.audioUrl), faq.id).toBeGreaterThan(3);
    }
  });
});
