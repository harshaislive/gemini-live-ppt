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
      "Beforest builds restored collectives: real landscapes where people can stay, eat, gather, and keep returning. Some people come through hospitality. Some through food from Bewild. Some through full membership. The 10% Life is for people who do not need full ownership, but want meaningful access: thirty person-nights a year, for ten years, inside these landscapes.",
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
      "The useful distinction is simple. Ownership asks you to take responsibility for an asset. Access asks a more practical question: will you actually return to the place and use it well? Beforest is for people who want a relationship with land, food, and restored landscapes without adding another property to manage.",
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
      "People arrive here from different places. Some are burnt out by work. Some want their children closer to nature. Some are curious because they have seen Beforest food, stays, or collectives from the outside. The 10% idea meets them in the same place: protect a small but serious part of the year, and the rest of life has a better chance of settling down.",
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
      "The experience is not just a room. It is the landscape, the food, the weather, the walking, the farms, the quiet, and the people who are stewarding the place. Hospitality is the front door, but the deeper value is repetition. You return enough times for the place to become familiar, not just impressive.",
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
      "The proof has to be on the ground. Beforest has spent years building collectives, restoring degraded land, creating hospitality inside those landscapes, and selling food through Bewild that comes from this way of working. The work now spans six collectives and more than a thousand acres under restoration. That is why 10% is limited by design.",
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
      "The structure is intentionally plain. A 10% member gets thirty person-nights a year, for ten years, across Beforest landscapes. It is access without full ownership. You are not buying a second home, and you are not just booking a holiday. You are reserving a recurring relationship with these places before the calendar fills up again.",
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
      "You should not decide this from a screen. The first real step is a stay, because the land will explain the idea better than I can. Go there. Eat the food. Walk the place. Notice whether your family actually wants to return. If the landscape makes sense in your body, the membership conversation becomes much simpler.",
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
      "If this feels serious, start with a stay. If you need more time, follow the updates and watch how the collectives, hospitality, and Bewild food system keep developing. There is no pressure in this. But if you already know you need a different rhythm, do not turn it into an abstract decision. Decide with your feet, not your eyes. See you in the slow lane.",
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
      "How 30 person-nights works",
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
      "30 person-nights must be practical",
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
