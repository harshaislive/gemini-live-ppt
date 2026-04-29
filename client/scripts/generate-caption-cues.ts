import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { NARRATION_CHUNKS, type CaptionCue } from "../app/presentationScript";

type TimedWord = {
  word: string;
  start: number;
  end: number;
};

const OUTPUT_PATH = path.join(process.cwd(), "app", "narrationCaptionCues.ts");
const WORDS_PER_CUE = 5;
const MIN_CUE_SECONDS = 0.75;

function readWavDurationSeconds(audioUrl: string) {
  const audioPath = path.join(process.cwd(), "public", audioUrl);
  const duration = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    audioPath,
  ], { encoding: "utf8" }).trim();
  return Number(duration);
}

function tokenize(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

function getWordWeight(word: string) {
  const plain = word.replace(/[^\p{L}\p{N}%]/gu, "");
  const punctuationPause = /[.!?]$/.test(word) ? 0.95 : /[,;:]$/.test(word) ? 0.45 : 0;
  const numericWeight = /\d|%/.test(plain) ? 0.4 : 0;
  return Math.max(0.55, plain.length * 0.14) + punctuationPause + numericWeight;
}

function timeWords(words: string[], durationSeconds: number): TimedWord[] {
  const weights = words.map(getWordWeight);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let cursor = 0;

  return words.map((word, index) => {
    const wordDuration = Math.max(0.12, (weights[index] / totalWeight) * durationSeconds);
    const timedWord = {
      word,
      start: cursor,
      end: Math.min(durationSeconds, cursor + wordDuration),
    };
    cursor = timedWord.end;
    return timedWord;
  });
}

function shouldEndCue(word: string, wordsInCue: number) {
  if (wordsInCue >= WORDS_PER_CUE) {
    return true;
  }
  if (wordsInCue >= 3 && /[.!?,;:]$/.test(word)) {
    return true;
  }
  return false;
}

function buildCaptionCues(text: string, durationSeconds: number): CaptionCue[] {
  const timedWords = timeWords(tokenize(text), durationSeconds);
  const cues: CaptionCue[] = [];
  let cueStartIndex = 0;

  for (let index = 0; index < timedWords.length; index += 1) {
    const wordsInCue = index - cueStartIndex + 1;
    if (!shouldEndCue(timedWords[index].word, wordsInCue) && index < timedWords.length - 1) {
      continue;
    }

    const cueWords = timedWords.slice(cueStartIndex, index + 1);
    const previousCue = cues.at(-1);
    const start = previousCue ? previousCue.end : cueWords[0].start;
    const naturalEnd = cueWords.at(-1)?.end ?? start + MIN_CUE_SECONDS;
    const end = Math.max(naturalEnd, start + MIN_CUE_SECONDS);
    cues.push({
      start: Number(start.toFixed(2)),
      end: Number(Math.min(durationSeconds, end).toFixed(2)),
      text: cueWords.map((word) => word.word).join(" "),
    });
    cueStartIndex = index + 1;
  }

  if (cues.length) {
    cues[cues.length - 1] = {
      ...cues[cues.length - 1],
      end: Number(durationSeconds.toFixed(2)),
    };
  }

  return cues;
}

const cuesByChunk = Object.fromEntries(NARRATION_CHUNKS.map((chunk) => {
  const durationSeconds = readWavDurationSeconds(chunk.audioUrl);
  return [chunk.id, buildCaptionCues(chunk.transcript, durationSeconds)];
}));

const output = `import type { CaptionCue, NarrationChunkId } from "./presentationScript";

export const NARRATION_CAPTION_CUES: Record<NarrationChunkId, CaptionCue[]> = ${JSON.stringify(cuesByChunk, null, 2)};
`;

writeFileSync(OUTPUT_PATH, output);
