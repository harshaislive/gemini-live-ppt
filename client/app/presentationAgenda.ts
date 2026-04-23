export type PresentationSectionId =
  | "opening_definition"
  | "access_model"
  | "fit_question"
  | "desire_scene"
  | "proof_limited"
  | "objection_question"
  | "membership_clarity"
  | "trial_stay_close"
  | "decision_question";

export type PresentationSection = {
  id: PresentationSectionId;
  stageLabel: string;
  visualId: string;
  goal: string;
  instruction: string;
  modalGoal?: string;
  nextSection?: PresentationSectionId;
};

export const PRESENTATION_AGENDA: PresentationSection[] = [
  {
    id: "opening_definition",
    stageLabel: "1 / Beforest and 10%",
    visualId: "opening-forest-road",
    goal: "Define Beforest and the 10% Life in the first ten seconds.",
    instruction:
      "Open immediately with what Beforest is and what the 10% Life is. Say Beforest builds and restores nature-first collectives people can return to. Say the 10% Life is access without ownership: thirty nights a year, roughly ten percent of life, inside Beforest landscapes. Keep this under 35 seconds. Do not ask a question yet.",
    nextSection: "access_model",
  },
  {
    id: "access_model",
    stageLabel: "2 / Access without ownership",
    visualId: "structure-clarity",
    goal: "Make access without ownership feel clear and differentiated.",
    instruction:
      "Explain that this is not a holiday club, not a second home, and not property ownership. It is a protected rhythm of return for people who want belonging to land without owning it. Keep it spare and concrete. Then call ask_listener_question with 2-4 options to learn why the listener is here.",
    modalGoal:
      "Ask what made them stay: access without ownership, need for serious reset, clarity on 30 nights, or Blyton first.",
    nextSection: "desire_scene",
  },
  {
    id: "fit_question",
    stageLabel: "3 / Listener fit",
    visualId: "protected-time-canopy",
    goal: "Use the listener's first choice to select the emotional angle.",
    instruction:
      "Briefly acknowledge the listener's choice. Do not over-explain. Bridge into the lived feeling of the 10% Life as a rhythm with land.",
    nextSection: "desire_scene",
  },
  {
    id: "desire_scene",
    stageLabel: "4 / What it feels like",
    visualId: "collective-landscape",
    goal: "Translate the video into desire: solitude, coffee, rain, canopy, and protected time.",
    instruction:
      "Narrate what the viewer is seeing as emotional proof. Speak about walking, coffee, rain, forest air, and silence without sounding like tourism copy. Make the viewer feel that this is a place asking less of them. Keep it under 45 seconds.",
    nextSection: "proof_limited",
  },
  {
    id: "proof_limited",
    stageLabel: "5 / Proof and limit",
    visualId: "proof-restoration",
    goal: "Establish trust, seriousness, and scarcity without sounding salesy.",
    instruction:
      "Ground the promise with approved proof: restored landscapes, six collectives, 1,300 acres, and families already in rhythm. Make clear that 10% is limited and serious by design, not built for the masses. Then ask one option-only question about what would decide fit.",
    modalGoal:
      "Ask what would decide whether this is right: the place feeling real, family use, 30-night practicality, or trying Blyton first.",
    nextSection: "membership_clarity",
  },
  {
    id: "objection_question",
    stageLabel: "6 / The real objection",
    visualId: "structure-clarity",
    goal: "Address the chosen objection and keep momentum.",
    instruction:
      "Answer the listener's selected concern directly. Stay concise. If they are trial-curious, move toward Blyton. If they need structure, explain the model plainly.",
    nextSection: "membership_clarity",
  },
  {
    id: "membership_clarity",
    stageLabel: "7 / The structure",
    visualId: "structure-clarity",
    goal: "Explain the membership structure only after desire and proof.",
    instruction:
      "Explain the structure in plain language: thirty person-nights a year, for ten years, across Beforest landscapes. It is rhythm, not accumulation. It is access without ownership. Do not break into per-night math.",
    nextSection: "trial_stay_close",
  },
  {
    id: "trial_stay_close",
    stageLabel: "8 / Blyton first",
    visualId: "trial-stay",
    goal: "Make Blyton Bungalow feel like the obvious next action.",
    instruction:
      "Say they should not decide this from a screen. The first real step is Blyton Bungalow: go there, walk the land, have coffee in the rain, and see whether the body understands it before the mind evaluates it. Then ask the final decision question.",
    modalGoal:
      "Ask what the right next step is: take the trial stay, receive more updates, understand membership, or not right now.",
    nextSection: "decision_question",
  },
  {
    id: "decision_question",
    stageLabel: "9 / Decision",
    visualId: "art-of-return-hero",
    goal: "Route the listener to trial stay or updates.",
    instruction:
      "Acknowledge the listener's decision. If they chose trial stay, point them to Blyton with calm conviction. If they chose updates or more membership clarity, respect that and keep the door open. Close with: You decide with your feet, not your eyes. See you in the slow lane.",
  },
];

export const FIRST_SECTION_ID: PresentationSectionId = "opening_definition";

export function getPresentationSection(sectionId: PresentationSectionId) {
  return PRESENTATION_AGENDA.find((section) => section.id === sectionId) || PRESENTATION_AGENDA[0];
}

export function getNextSectionId(sectionId: PresentationSectionId) {
  return getPresentationSection(sectionId).nextSection;
}

export function buildSectionTurnPrompt(params: {
  section: PresentationSection;
  listenerChoice?: string;
  completedSections: PresentationSectionId[];
}) {
  const completed = params.completedSections.length
    ? params.completedSections.join(", ")
    : "none yet";
  const choiceLine = params.listenerChoice
    ? `\nListener just chose: ${params.listenerChoice}`
    : "";
  const modalLine = params.section.modalGoal
    ? `\nThis section requires a modal gate. Call ask_listener_question with 2-4 concise options before moving on. Modal goal: ${params.section.modalGoal}`
    : "\nDo not call ask_listener_question in this section unless the listener explicitly asks to choose.";

  return [
    "Presenter runtime state:",
    `- Current section: ${params.section.id}`,
    `- Section goal: ${params.section.goal}`,
    `- Completed sections: ${completed}`,
    choiceLine.trim(),
    "",
    "Presenter instruction:",
    params.section.instruction,
    modalLine.trim(),
    "",
    "Rules:",
    "- Speak as the presenter inside the guided screening.",
    "- Keep this section concise. Do not recap the whole agenda.",
    "- Use the current visual as emotional context.",
    "- If you call a modal, stop speaking and wait for the listener choice.",
  ].filter(Boolean).join("\n");
}
