export type BeforestVisual = {
  id: string;
  title: string;
  imageUrl: string;
  hook: string;
  note: string;
  alt: string;
  tags?: string[];
  bestFor?: string[];
};

export const INITIAL_VISUAL: BeforestVisual = {
  id: "opening-forest-road",
  title: "The first exhale",
  imageUrl:
    "https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PBR_0209.jpg",
  hook: "Spend 30 nights a year in India’s rewilded landscapes.",
  note:
    "1,300 acres being restored across diverse landscapes, including the Western Ghats — shaped by real silence, real wilderness, and return.",
  alt: "A quiet forest road framed by dense greenery and soft light.",
  tags: ["opening", "recovery", "protection"],
  bestFor: ["opening", "identity"],
};

export const PROMPT_SUGGESTIONS = [
  "What exactly is the 10% Life?",
  "How does the membership structure work?",
  "Tell me about Blyton Bungalow first.",
  "Why is the trial stay the smartest first step?",
];

export const DEFAULT_STATUS =
  "A calm, Gemini Live walkthrough of protection, rhythm, and return.";
