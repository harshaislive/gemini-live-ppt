import type { PresentationSectionId } from "./presentationAgenda";

export type NarrationChunkId =
  | "opening_definition"
  | "access_without_ownership"
  | "why_ten_percent"
  | "what_it_feels_like"
  | "proof_and_limit"
  | "membership_structure"
  | "blyton_first"
  | "decision_close";

export type NarrationGate = {
  id: string;
  afterChunkId: NarrationChunkId;
  question: string;
  context: string;
  options: string[];
};

export type NarrationChunk = {
  id: NarrationChunkId;
  sectionId: PresentationSectionId;
  stageLabel: string;
  visualId: string;
  audioUrl: string;
  transcript: string;
  durationSeconds: number;
  resumeMode: "restart_chunk" | "next_chunk";
  returnLine: string;
  nextChunkId?: NarrationChunkId;
};

export const NARRATION_CHUNKS: NarrationChunk[] = [
  {
    id: "opening_definition",
    sectionId: "opening_definition",
    stageLabel: "1 / Beforest and 10%",
    visualId: "opening-forest-road",
    audioUrl: "/audio/narration/01-opening-definition.wav",
    durationSeconds: 30,
    resumeMode: "restart_chunk",
    returnLine: "Let's get back now.",
    nextChunkId: "access_without_ownership",
    transcript:
      "Beforest builds restored hospitality landscapes that people can keep returning to. The 10% Life is the cleanest way to access that world without taking on ownership: thirty nights a year, roughly ten percent of life, inside Beforest landscapes. It is not a holiday club, and it is not a second home. It is a protected rhythm of return.",
  },
  {
    id: "access_without_ownership",
    sectionId: "access_model",
    stageLabel: "2 / Access without ownership",
    visualId: "structure-clarity",
    audioUrl: "/audio/narration/02-access-without-ownership.wav",
    durationSeconds: 35,
    resumeMode: "restart_chunk",
    returnLine: "Let's come back to the structure.",
    nextChunkId: "why_ten_percent",
    transcript:
      "The useful distinction is simple. Ownership asks you to manage an asset. Access asks whether the place changes how you live. Beforest is for people who want belonging to land without acquiring another thing to maintain. Thirty nights gives the body enough repetition to remember a slower rhythm, while the rest of life stays light.",
  },
  {
    id: "why_ten_percent",
    sectionId: "fit_question",
    stageLabel: "3 / Why 10% works",
    visualId: "protected-time-canopy",
    audioUrl: "/audio/narration/03-why-ten-percent.wav",
    durationSeconds: 37,
    resumeMode: "restart_chunk",
    returnLine: "Let's return to why the rhythm matters.",
    nextChunkId: "what_it_feels_like",
    transcript:
      "Modern life does not usually break people dramatically. It erodes them quietly through sensory demand, decision load, interruptions, and a permanent pressure to respond. The 10% idea came from that reality. If you protect a meaningful slice of the year, the other ninety percent starts to steady itself.",
  },
  {
    id: "what_it_feels_like",
    sectionId: "desire_scene",
    stageLabel: "4 / What it feels like",
    visualId: "collective-landscape",
    audioUrl: "/audio/narration/04-what-it-feels-like.wav",
    durationSeconds: 38,
    resumeMode: "restart_chunk",
    returnLine: "Let's step back into the place.",
    nextChunkId: "proof_and_limit",
    transcript:
      "The value is not in a room alone. It is in the morning walk, coffee in weather, canopy above you, biodiversity returning around you, and silence that does not perform for you. A Beforest landscape asks less of you. It gives your attention somewhere quieter to land, again and again.",
  },
  {
    id: "proof_and_limit",
    sectionId: "proof_limited",
    stageLabel: "5 / Proof and limit",
    visualId: "proof-restoration",
    audioUrl: "/audio/narration/05-proof-and-limit.wav",
    durationSeconds: 39,
    resumeMode: "restart_chunk",
    returnLine: "Let's return to the proof.",
    nextChunkId: "membership_structure",
    transcript:
      "Trust should be built on land, not language. Beforest has spent years restoring landscapes, shaping collectives, and learning what hospitality means when nature comes first. The work now spans six collectives and more than a thousand acres under restoration. The 10% Life is limited by design because serious rhythm cannot be mass-produced.",
  },
  {
    id: "membership_structure",
    sectionId: "membership_clarity",
    stageLabel: "6 / The structure",
    visualId: "structure-clarity",
    audioUrl: "/audio/narration/06-membership-structure.wav",
    durationSeconds: 34,
    resumeMode: "restart_chunk",
    returnLine: "Let's get back to the membership.",
    nextChunkId: "blyton_first",
    transcript:
      "The structure is intentionally plain. A member receives thirty person-nights a year, for ten years, across Beforest landscapes. It is rhythm, not accumulation. It is access without ownership. The point is not to calculate every night. The point is to make return possible before life fills the calendar again.",
  },
  {
    id: "blyton_first",
    sectionId: "trial_stay_close",
    stageLabel: "7 / Blyton first",
    visualId: "trial-stay",
    audioUrl: "/audio/narration/07-blyton-first.wav",
    durationSeconds: 37,
    resumeMode: "restart_chunk",
    returnLine: "Let's return to the first real step.",
    nextChunkId: "decision_close",
    transcript:
      "You should not decide this from a screen. The first real step is Blyton Bungalow. Go there. Walk the land. Have coffee in the rain. Notice whether your body understands the promise before your mind tries to evaluate it. If the land gives clarity, the membership conversation becomes much simpler.",
  },
  {
    id: "decision_close",
    sectionId: "decision_question",
    stageLabel: "8 / The first step",
    visualId: "art-of-return-hero",
    audioUrl: "/audio/narration/08-decision-close.wav",
    durationSeconds: 31,
    resumeMode: "next_chunk",
    returnLine: "Let's close this properly.",
    transcript:
      "If this feels serious, take the trial stay. If you need more time, receive the updates and keep listening for the moment when silence stops feeling optional. There is no pressure in this. But there is a cost to postponing recovery for another year. You decide with your feet, not your eyes. See you in the slow lane.",
  },
];

export const NARRATION_GATES: NarrationGate[] = [
  {
    id: "opening-fit",
    afterChunkId: "access_without_ownership",
    question: "What should this walkthrough make clearer for you?",
    context: "This helps the next section stay useful without turning the presentation into open chat.",
    options: [
      "Access without ownership",
      "The need for a serious reset",
      "How 30 nights works",
      "Blyton trial stay first",
    ],
  },
  {
    id: "proof-fit",
    afterChunkId: "proof_and_limit",
    question: "What would decide whether this is right?",
    context: "Choose the thing that would make the 10% Life feel practical enough to explore.",
    options: [
      "The place has to feel real",
      "Family use matters most",
      "30 nights must be practical",
      "Trying Blyton first",
    ],
  },
  {
    id: "next-step",
    afterChunkId: "blyton_first",
    question: "What feels like the right next step?",
    context: "The presentation can close toward action, updates, or structure depending on where you are.",
    options: [
      "Take the trial stay",
      "Receive more updates",
      "Understand membership",
      "Not right now",
    ],
  },
];

export function getNarrationChunk(chunkId: NarrationChunkId) {
  return NARRATION_CHUNKS.find((chunk) => chunk.id === chunkId) || NARRATION_CHUNKS[0];
}

export function getNextNarrationChunk(chunkId: NarrationChunkId) {
  const nextChunkId = getNarrationChunk(chunkId).nextChunkId;
  return nextChunkId ? getNarrationChunk(nextChunkId) : undefined;
}

export function getGateAfterChunk(chunkId: NarrationChunkId) {
  return NARRATION_GATES.find((gate) => gate.afterChunkId === chunkId);
}

export function buildTranscriptWindow(transcript: string, elapsedSeconds: number, durationSeconds: number, leadSeconds = 1.8) {
  const words = transcript.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "";
  }
  const ratio = Math.max(0, Math.min(1, (elapsedSeconds + leadSeconds) / Math.max(1, durationSeconds)));
  const end = Math.max(8, Math.ceil(words.length * ratio));
  const start = Math.max(0, end - 18);
  return words.slice(start, end).join(" ");
}
