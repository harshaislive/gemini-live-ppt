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

export type PromptAnswerAction =
  | "continue"
  | "show_trial_cta"
  | "open_updates"
  | "replay_membership"
  | "soft_close";

export type PreparedFaq = {
  id: string;
  question: string;
  answer: string;
  audioUrl: string;
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
    stageLabel: "1 / Beforest",
    visualId: "opening-forest-road",
    audioUrl: "/audio/narration/01-opening-definition.wav",
    durationSeconds: 31.731,
    resumeMode: "restart_chunk",
    returnLine: "Let's get back now.",
    nextChunkId: "access_without_ownership",
    transcript:
      "Before we jump into the 10% Life, let me tell you where this actually started. Beforest began with a simple question: what would it take to bring degraded land back to life, and let people belong to that land without turning it into another real estate product? So across India, we have been building permanent, regenerating food forests. Not resorts. Not weekend farmhouses. Real working landscapes where soil, water, food, wildlife, and people recover together.",
  },
  {
    id: "access_without_ownership",
    sectionId: "access_model",
    stageLabel: "2 / The complete ecosystem",
    visualId: "structure-clarity",
    audioUrl: "/audio/narration/02-access-without-ownership.wav",
    durationSeconds: 41.891,
    resumeMode: "restart_chunk",
    returnLine: "Let's come back to the structure.",
    nextChunkId: "why_ten_percent",
    transcript:
      "10% comes from this larger Beforest world. At the center are the collectives: large restored landscapes where members come together to co-own, steward, and participate in regeneration. Around that, there are experiences inside the collectives: walks, volunteering, coffee, night skies, family programs, and ways to come close to the land. There is hospitality, like Blyton Bungalow in Coorg. And there is Be Wild, which carries food grown in these collectives out into the world: coffee, rice, spices, oils, and more. 10% is not separate from this. It is built from the same landscapes.",
  },
  {
    id: "why_ten_percent",
    sectionId: "fit_question",
    stageLabel: "3 / Why 10% works",
    visualId: "protected-time-canopy",
    audioUrl: "/audio/narration/03-why-ten-percent.wav",
    durationSeconds: 39.651,
    resumeMode: "restart_chunk",
    returnLine: "Let's return to why the rhythm matters.",
    nextChunkId: "what_it_feels_like",
    transcript:
      "But not everyone who belongs to this world wants to become a collective member. Some people do not want to own part of a collective. They do not want voting responsibilities, land decisions, farming conversations, staff management, or the emotional and financial weight of ownership. But they still want access to these landscapes. Not as tourists. Not as one-time guests. They want to return. They want their children to know these places. They want food, weather, walking, quiet, and the feeling of being connected to land through the year. That is why we created 10%.",
  },
  {
    id: "what_it_feels_like",
    sectionId: "desire_scene",
    stageLabel: "4 / What it feels like",
    visualId: "collective-landscape",
    audioUrl: "/audio/narration/04-what-it-feels-like.wav",
    durationSeconds: 27.811,
    resumeMode: "restart_chunk",
    returnLine: "Let's step back into the place.",
    nextChunkId: "proof_and_limit",
    transcript:
      "10% is a serious access membership. A 10% member gets thirty person-nights a year, for ten years, across Beforest landscapes. And let me say that clearly: thirty person-nights. Not thirty room nights. It is measured by the number of people using the landscape across the year. So you are not buying land. You are not becoming a collective owner. But you are also not just booking a holiday. You are reserving a recurring relationship with these landscapes.",
  },
  {
    id: "proof_and_limit",
    sectionId: "proof_limited",
    stageLabel: "5 / Proof and limit",
    visualId: "proof-restoration",
    audioUrl: "/audio/narration/05-proof-and-limit.wav",
    durationSeconds: 27.851,
    resumeMode: "restart_chunk",
    returnLine: "Let's return to the proof.",
    nextChunkId: "membership_structure",
    transcript:
      "The value is not just where you sleep. It is waking up inside a landscape that is being restored. It is eating food from the same land. It is walking under canopy, watching the weather change, hearing fewer machines and more life. The first visit may feel beautiful. But the real shift happens when you return again and again. That is when the land stops being a destination and starts becoming part of your rhythm.",
  },
  {
    id: "membership_structure",
    sectionId: "membership_clarity",
    stageLabel: "6 / The structure",
    visualId: "structure-clarity",
    audioUrl: "/audio/narration/06-membership-structure.wav",
    durationSeconds: 40.531,
    resumeMode: "restart_chunk",
    returnLine: "Let's get back to the membership.",
    nextChunkId: "blyton_first",
    transcript:
      "We are careful with 10% because access to real landscapes has to be designed responsibly. These are not empty holiday properties. These are living, working collectives. The land has to keep improving. The communities have to keep functioning. The experience has to stay quiet, limited, and respectful of the place. Beforest has spent years building collectives, restoring land, growing food through Be Wild, and creating hospitality inside these landscapes. 10% works only because that foundation already exists.",
  },
  {
    id: "blyton_first",
    sectionId: "trial_stay_close",
    stageLabel: "7 / Blyton first",
    visualId: "trial-stay",
    audioUrl: "/audio/narration/07-blyton-first.wav",
    durationSeconds: 25.971,
    resumeMode: "restart_chunk",
    returnLine: "Let's return to the first real step.",
    nextChunkId: "decision_close",
    transcript:
      "If you are wondering whether this is right for you, our honest suggestion is: do not decide from a screen. Start with Blyton. Come to Coorg. Stay there. Walk the land. Eat the food. Have coffee in the rain. See how your body responds before your mind turns it into a spreadsheet. If the place makes sense to you and your family, the 10% conversation becomes much easier.",
  },
  {
    id: "decision_close",
    sectionId: "decision_question",
    stageLabel: "8 / The first step",
    visualId: "art-of-return-hero",
    audioUrl: "/audio/narration/08-decision-close.wav",
    durationSeconds: 34.811,
    resumeMode: "next_chunk",
    returnLine: "Let's close this properly.",
    transcript:
      "So that is the invitation. If you want food from these landscapes, Be Wild already brings that to you. If you want to experience the land first, hospitality and experiences are good doors in. And if what you want is recurring access to Beforest landscapes without becoming a collective owner, then 10% is the point of this conversation. Thirty person-nights a year. Ten years. Access to real regenerating landscapes, without ownership burden. Start with the land. If the land makes sense, 10% is how you keep returning.",
  },
];

export const PREPARED_FAQS: PreparedFaq[] = [
  {
    id: "families",
    question: "How does this work for couples and families?",
    audioUrl: "/audio/faq/01-families.wav",
    answer:
      "Immediate family participation is allowed. The important thing is that usage is counted as person-nights, so the access stays fair and clear across families of different sizes.",
  },
  {
    id: "person-nights",
    question: "Why count person-nights instead of room nights?",
    audioUrl: "/audio/faq/02-person-nights.wav",
    answer:
      "Because 10% is designed as recurring access to the landscape, not a room inventory product. Person-nights make the actual use of the land visible while still making room for family participation.",
  },
  {
    id: "children",
    question: "Do children count toward the person-night usage?",
    audioUrl: "/audio/faq/03-children.wav",
    answer:
      "The Founding Silence clarification said immediate family participation is allowed, and children under twelve do not count toward person-night usage. That keeps the model family-friendly while still making adult usage clear.",
  },
  {
    id: "long-stretches",
    question: "Can the nights be used in long stretches?",
    audioUrl: "/audio/faq/04-long-stretches.wav",
    answer:
      "Yes, longer stays are possible, subject to availability and the broader effort to keep access workable for everyone. The spirit is rhythm, not hoarding peak dates.",
  },
  {
    id: "carry-forward",
    question: "Will unused nights carry forward?",
    audioUrl: "/audio/faq/05-carry-forward.wav",
    answer:
      "No. There is no carry-forward because the point is rhythm, not accumulation. 10% is meant to pull you back to the land each year, not become a balance you optimize later.",
  },
  {
    id: "weekends",
    question: "How much of the allocation can sit on weekends?",
    audioUrl: "/audio/faq/06-weekends.wav",
    answer:
      "The Founding Silence conversation described a two-to-one weekday-to-weekend balance. In simple terms, for every weekend booking, members should expect roughly two weekday nights as well, so access does not collapse onto a few peak dates.",
  },
  {
    id: "timeshare",
    question: "How is this different from a timeshare?",
    audioUrl: "/audio/faq/07-timeshare.wav",
    answer:
      "The similarity is only at the surface level of access. The real difference is density, intent, and relationship to land. 10% is about returning to regenerating Beforest landscapes as a way of life, not buying leisure inventory.",
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

export function getPromptAnswerAction(gateId: string, answer: string): PromptAnswerAction {
  if (gateId !== "next-step") {
    return "continue";
  }

  const normalized = answer.trim().toLowerCase();
  if (normalized.includes("trial")) {
    return "show_trial_cta";
  }
  if (normalized.includes("updates")) {
    return "open_updates";
  }
  if (normalized.includes("membership")) {
    return "replay_membership";
  }
  if (normalized.includes("not right") || normalized.includes("skip")) {
    return "soft_close";
  }
  return "continue";
}

export function buildTranscriptWindow(transcript: string, elapsedSeconds: number, durationSeconds: number, leadSeconds = 0.2) {
  const words = transcript.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "";
  }
  const wordsPerCue = 5;
  if (words.length <= wordsPerCue) {
    return words.join(" ");
  }
  const cueCount = Math.ceil(words.length / wordsPerCue);
  const ratio = Math.max(0, Math.min(0.9999, (elapsedSeconds + leadSeconds) / Math.max(1, durationSeconds)));
  const cueIndex = Math.min(cueCount - 1, Math.floor(ratio * cueCount));
  const start = cueIndex * wordsPerCue;
  const end = Math.min(words.length, start + wordsPerCue);
  return words.slice(start, end).join(" ");
}
