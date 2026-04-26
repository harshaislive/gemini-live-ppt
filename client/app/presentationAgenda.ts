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
    stageLabel: "1 / Beforest",
    visualId: "opening-forest-road",
    goal: "Define Beforest first as the serious restoration and collective ownership system.",
    instruction:
      "Open immediately with Beforest, not 10%. Say Beforest is building permanent, regenerating landscapes across India: 1,300 acres and growing, with food forests where the land naturally supports them. Make clear this is not eco-tourism and not weekend farmhouses; it is landscape-scale restoration backed by community ownership and disciplined execution. Mention soil, water, biodiversity, food where appropriate, wildlife, and people improving together. Keep it adult-to-adult and conversational. Do not ask a question yet.",
    nextSection: "access_model",
  },
  {
    id: "access_model",
    stageLabel: "2 / The complete ecosystem",
    visualId: "structure-clarity",
    goal: "Map the complete Beforest ecosystem, then introduce 10% as the access-without-ownership path.",
    instruction:
      "Explain Beforest as one integrated system with five clear functions: beforest.co for land, restoration, and collective ownership; Bewild, pronounced Be Wild, at bewild.life for food that emerges from suitable collectives; hospitality.beforest.co for Blyton Bungalow; experiences.beforest.co for limited immersive programs; and 10percent.beforest.co for recurring access without ownership burden. Then define 10% plainly: thirty person-nights a year, for ten years, for people who need regular deep time in regenerating wilderness without buying land, managing staff, or carrying maintenance responsibility. Then call ask_listener_question with 2-4 options to learn where the listener is coming from.",
    modalGoal:
      "Ask what brought them here: collective experiences, hospitality stays, Bewild food, access without ownership, clarity on 30 person-nights, or Blyton first.",
    nextSection: "desire_scene",
  },
  {
    id: "fit_question",
    stageLabel: "3 / Listener fit",
    visualId: "protected-time-canopy",
    goal: "Use the listener's first choice to select the emotional angle.",
    instruction:
      "Briefly acknowledge the listener's choice and match the next sentence to where they are coming from. If they came through food, connect Bewild to the landscapes and farms. If they came through hospitality, connect the stay to repeated return. If they came through collectives, connect membership to belonging. Do not over-explain. Bridge into the lived feeling of the 10% Life as a rhythm with land.",
    nextSection: "desire_scene",
  },
  {
    id: "desire_scene",
    stageLabel: "4 / What it feels like",
    visualId: "collective-landscape",
    goal: "Translate the video into desire: solitude, coffee, rain, canopy, and protected time.",
    instruction:
      "Narrate what the viewer is seeing as practical emotional proof. Speak about walking, food, weather, forest air, hospitality, restored ground, and silence without sounding like tourism copy. Make clear that experiences happen inside the collectives; they are not separate from the land system. Keep it under 45 seconds.",
    nextSection: "proof_limited",
  },
  {
    id: "proof_limited",
    stageLabel: "5 / Proof and limit",
    visualId: "proof-restoration",
    goal: "Establish trust, seriousness, and scarcity without sounding salesy.",
    instruction:
      "Ground the promise with approved proof: restored landscapes, six collectives, 1,300 acres, families already in rhythm, hospitality in the collectives, and Bewild as food from suitable collectives, where the landscape naturally supports it. Make clear that 10% is limited and serious by design, not built for the masses. Then ask one option-only question about what would decide fit.",
    modalGoal:
      "Ask what would decide whether this is right: the place feeling real, family use, 30 person-nights practicality, or trying Blyton first.",
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
      "Explain the structure in plain language: thirty person-nights a year, for ten years, across Beforest landscapes. It is rhythm, not accumulation. It is access without full ownership for people who do not need to be full collective owners but want recurring access to these landscapes. Do not break into per-night math.",
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

export type PresentationSegmentId =
  | "opening_to_fit"
  | "desire_to_proof"
  | "membership_to_trial"
  | "decision_close";

export type PresentationSegment = {
  id: PresentationSegmentId;
  stageLabel: string;
  visualId: string;
  sectionIds: PresentationSectionId[];
  gateSectionId: PresentationSectionId;
};

export type PlannerStrategy =
  | "continue"
  | "compress"
  | "clarify"
  | "trial_ready"
  | "updates_path";

export type PlannerDecision = {
  targetSegmentId: PresentationSegmentId;
  confidence: number;
  strategy: PlannerStrategy;
  presenterBrief: string;
  reason: string;
};

export const PRESENTATION_SEGMENTS: PresentationSegment[] = [
  {
    id: "opening_to_fit",
    stageLabel: "1 / Beforest and 10%",
    visualId: "opening-forest-road",
    sectionIds: ["opening_definition", "access_model"],
    gateSectionId: "access_model",
  },
  {
    id: "desire_to_proof",
    stageLabel: "2 / Why this feels different",
    visualId: "collective-landscape",
    sectionIds: ["desire_scene", "proof_limited"],
    gateSectionId: "proof_limited",
  },
  {
    id: "membership_to_trial",
    stageLabel: "3 / Trial stay first",
    visualId: "structure-clarity",
    sectionIds: ["membership_clarity", "trial_stay_close"],
    gateSectionId: "trial_stay_close",
  },
  {
    id: "decision_close",
    stageLabel: "4 / Choose the first step",
    visualId: "art-of-return-hero",
    sectionIds: ["decision_question"],
    gateSectionId: "decision_question",
  },
];

export const FIRST_SEGMENT_ID: PresentationSegmentId = "opening_to_fit";

export function isPresentationSectionId(value: unknown): value is PresentationSectionId {
  return typeof value === "string" && PRESENTATION_AGENDA.some((section) => section.id === value);
}

export function getPresentationSection(sectionId: PresentationSectionId) {
  return PRESENTATION_AGENDA.find((section) => section.id === sectionId) || PRESENTATION_AGENDA[0];
}

export function getNextSectionId(sectionId: PresentationSectionId) {
  return getPresentationSection(sectionId).nextSection;
}

export function getPresentationSegment(segmentId: PresentationSegmentId) {
  return PRESENTATION_SEGMENTS.find((segment) => segment.id === segmentId) || PRESENTATION_SEGMENTS[0];
}

export function getNextSegmentAfterGate(sectionId: PresentationSectionId) {
  if (sectionId === "access_model") {
    return getPresentationSegment("desire_to_proof");
  }
  if (sectionId === "proof_limited") {
    return getPresentationSegment("membership_to_trial");
  }
  if (sectionId === "trial_stay_close") {
    return getPresentationSegment("decision_close");
  }
  return undefined;
}

export function getAllowedNextSegments(params: {
  currentSegmentId: PresentationSegmentId;
  gateSectionId: PresentationSectionId;
}) {
  const currentSegment = getPresentationSegment(params.currentSegmentId);
  if (currentSegment.gateSectionId !== params.gateSectionId) {
    return [] as PresentationSegmentId[];
  }

  if (params.currentSegmentId === "opening_to_fit") {
    return ["desire_to_proof", "membership_to_trial"] as PresentationSegmentId[];
  }
  if (params.currentSegmentId === "desire_to_proof") {
    return ["membership_to_trial", "decision_close"] as PresentationSegmentId[];
  }
  if (params.currentSegmentId === "membership_to_trial") {
    return ["decision_close"] as PresentationSegmentId[];
  }
  return [] as PresentationSegmentId[];
}

export function coercePlannerDecision(params: {
  currentSegmentId: PresentationSegmentId;
  gateSectionId: PresentationSectionId;
  decision?: Partial<PlannerDecision> | null;
}) {
  const strategies: PlannerStrategy[] = ["continue", "compress", "clarify", "trial_ready", "updates_path"];
  const allowed = getAllowedNextSegments(params);
  const currentSegment = getPresentationSegment(params.currentSegmentId);
  const fallback = currentSegment.gateSectionId === params.gateSectionId
    ? getNextSegmentAfterGate(params.gateSectionId)
    : undefined;
  const fallbackId = allowed[0] || fallback?.id || params.currentSegmentId;
  const requestedTarget = params.decision?.targetSegmentId;
  const targetSegmentId = requestedTarget && allowed.includes(requestedTarget)
    ? requestedTarget
    : fallbackId;
  const confidence = typeof params.decision?.confidence === "number"
    ? Math.max(0, Math.min(1, params.decision.confidence))
    : 0.5;
  const strategy = params.decision?.strategy && strategies.includes(params.decision.strategy)
    ? params.decision.strategy
    : "continue";
  const presenterBrief = params.decision?.presenterBrief?.trim()
    || "Continue the guided presentation naturally and keep momentum toward the Blyton trial stay.";
  const reason = params.decision?.reason?.trim()
    || "Fallback route selected by the app's agenda policy.";

  return {
    targetSegmentId,
    confidence,
    strategy,
    presenterBrief,
    reason,
  } satisfies PlannerDecision;
}

export function buildSegmentTurnPrompt(params: {
  segment: PresentationSegment;
  listenerChoice?: string;
  supervisorBrief?: string;
  completedSections: PresentationSectionId[];
}) {
  const completed = params.completedSections.length
    ? params.completedSections.join(", ")
    : "none yet";
  const choiceLine = params.listenerChoice
    ? `\nListener context from the last modal: ${params.listenerChoice}`
    : "";
  const sections = params.segment.sectionIds.map((sectionId) => getPresentationSection(sectionId));
  const gate = getPresentationSection(params.segment.gateSectionId);
  const supervisorLine = params.supervisorBrief
    ? `\nSupervisor routing brief: ${params.supervisorBrief}`
    : "";
  const responseModeLine = params.listenerChoice
    ? "Acknowledge the listener choice in one short sentence, then continue into the full act. Do not stop after the acknowledgement."
    : "Open the act directly. Do not stall or ask for permission.";
  const modalLine = gate.modalGoal
    ? `Only after completing every act instruction, call ask_listener_question with 2-4 concise options. Modal goal: ${gate.modalGoal}`
    : "Do not call ask_listener_question in this act. Close cleanly.";

  return [
    "Presenter runtime state:",
    `- Current act: ${params.segment.id}`,
    `- Visible stage label: ${params.segment.stageLabel}`,
    `- Completed sections: ${completed}`,
    choiceLine.trim(),
    supervisorLine.trim(),
    "",
    "Act instructions:",
    ...sections.flatMap((section, index) => [
      `${index + 1}. ${section.goal}`,
      `   ${section.instruction}`,
    ]),
    "",
    "Pacing rules:",
    "- Speak as one continuous human presentation act, not separate slides.",
    "- Sound like an adult talking to another adult: warm, plain, and specific. No stage voice, no brochure copy.",
    "- Do not stop between the listed sections. Bridge naturally from one idea to the next.",
    `- ${responseModeLine}`,
    "- Use show_curated_image only at natural visual shifts, and do not mention the tool.",
    "- The act should last roughly 35-65 seconds. Never end after only a brief acknowledgement.",
    `- ${modalLine}`,
    "- If you call a modal, do it as the final action of the act, then stop speaking and wait for the listener choice.",
  ].filter(Boolean).join("\n");
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
    "- Sound like an adult talking to another adult: warm, plain, and specific. No stage voice, no brochure copy.",
    "- Keep this section concise. Do not recap the whole agenda.",
    "- Use the current visual as emotional context.",
    "- If you call a modal, stop speaking and wait for the listener choice.",
  ].filter(Boolean).join("\n");
}
