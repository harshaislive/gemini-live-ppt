import { describe, expect, it } from "vitest";
import {
  FIRST_SEGMENT_ID,
  buildSegmentTurnPrompt,
  coercePlannerDecision,
  getAllowedNextSegments,
  getNextSegmentAfterGate,
  getPresentationSegment,
  isPresentationSectionId,
} from "./presentationAgenda";

describe("presentation agenda routing", () => {
  it("starts on the opening act and gates through access_model", () => {
    const firstSegment = getPresentationSegment(FIRST_SEGMENT_ID);
    expect(firstSegment.id).toBe("opening_to_fit");
    expect(firstSegment.gateSectionId).toBe("access_model");
  });

  it("validates presentation section ids before route code trusts them", () => {
    expect(isPresentationSectionId("access_model")).toBe(true);
    expect(isPresentationSectionId("not_a_real_section")).toBe(false);
    expect(isPresentationSectionId(null)).toBe(false);
  });

  it("limits next segments to explicit graph edges", () => {
    expect(getAllowedNextSegments({
      currentSegmentId: "opening_to_fit",
      gateSectionId: "access_model",
    })).toEqual(["desire_to_proof", "membership_to_trial"]);

    expect(getAllowedNextSegments({
      currentSegmentId: "membership_to_trial",
      gateSectionId: "trial_stay_close",
    })).toEqual(["decision_close"]);

    expect(getAllowedNextSegments({
      currentSegmentId: "decision_close",
      gateSectionId: "decision_question",
    })).toEqual([]);
  });

  it("rejects stale modal gates that do not belong to the current segment", () => {
    expect(getAllowedNextSegments({
      currentSegmentId: "opening_to_fit",
      gateSectionId: "trial_stay_close",
    })).toEqual([]);

    const decision = coercePlannerDecision({
      currentSegmentId: "opening_to_fit",
      gateSectionId: "trial_stay_close",
      decision: {
        targetSegmentId: "decision_close",
        confidence: 0.9,
        strategy: "trial_ready",
        presenterBrief: "Close now.",
        reason: "Impossible stale gate.",
      },
    });

    expect(decision.targetSegmentId).toBe("opening_to_fit");
  });

  it("falls back to the linear agenda when there is no supervisor decision", () => {
    expect(getNextSegmentAfterGate("access_model")?.id).toBe("desire_to_proof");
    expect(getNextSegmentAfterGate("proof_limited")?.id).toBe("membership_to_trial");
    expect(getNextSegmentAfterGate("trial_stay_close")?.id).toBe("decision_close");
  });

  it("rejects illegal supervisor jumps and clamps confidence", () => {
    const decision = coercePlannerDecision({
      currentSegmentId: "opening_to_fit",
      gateSectionId: "access_model",
      decision: {
        targetSegmentId: "decision_close",
        confidence: 4,
        strategy: "trial_ready",
        presenterBrief: "Jump straight to the final CTA.",
        reason: "The viewer sounds ready.",
      },
    });

    expect(decision.targetSegmentId).toBe("desire_to_proof");
    expect(decision.confidence).toBe(1);
    expect(decision.strategy).toBe("trial_ready");
  });

  it("accepts legal compressed routing toward structure when requested", () => {
    const decision = coercePlannerDecision({
      currentSegmentId: "opening_to_fit",
      gateSectionId: "access_model",
      decision: {
        targetSegmentId: "membership_to_trial",
        confidence: 0.72,
        strategy: "compress",
        presenterBrief: "They care about the 30 person-nights structure, so explain it quickly.",
        reason: "The listener selected clarity on 30 person-nights.",
      },
    });

    expect(decision.targetSegmentId).toBe("membership_to_trial");
    expect(decision.confidence).toBe(0.72);
    expect(decision.presenterBrief).toContain("30 person-nights");
  });

  it("keeps final decision segment stable when there is no downstream edge", () => {
    const decision = coercePlannerDecision({
      currentSegmentId: "decision_close",
      gateSectionId: "decision_question",
      decision: null,
    });

    expect(decision.targetSegmentId).toBe("decision_close");
    expect(decision.reason).toContain("Fallback");
  });
});

describe("presentation prompts", () => {
  it("injects supervisor routing brief into the next realtime presenter act", () => {
    const prompt = buildSegmentTurnPrompt({
      segment: getPresentationSegment("membership_to_trial"),
      listenerChoice: "Listener selected: I want to understand 30 person-nights",
      supervisorBrief: "Clarify structure, then move to Blyton without extra philosophy.",
      completedSections: ["access_model", "proof_limited"],
    });

    expect(prompt).toContain("Supervisor routing brief: Clarify structure");
    expect(prompt).toContain("Current act: membership_to_trial");
    expect(prompt).toContain("Do not stop after the acknowledgement");
    expect(prompt).toContain("Never end after only a brief acknowledgement");
    expect(prompt).toContain("thirty person-nights a year");
    expect(prompt).toContain("call ask_listener_question");
  });
});
