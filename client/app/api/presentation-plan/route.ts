import { GoogleGenAI } from "@google/genai/node";
import { NextRequest, NextResponse } from "next/server";
import {
  PRESENTATION_SEGMENTS,
  coercePlannerDecision,
  getAllowedNextSegments,
  getPresentationSegment,
  type PlannerDecision,
  type PresentationSegmentId,
  type PresentationSectionId,
} from "@/app/presentationAgenda";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PLANNER_MODEL = process.env.GEMINI_PLANNER_MODEL || "gemini-2.5-flash";
const ACCESS_COOKIE = "beforest_presentation_access";
const PASSCODE = process.env.PRESENTATION_PASSCODE?.trim() || "";

export const revalidate = 0;

function isPresentationSegmentId(value: unknown): value is PresentationSegmentId {
  return typeof value === "string" && PRESENTATION_SEGMENTS.some((segment) => segment.id === value);
}

function parsePlannerJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  return JSON.parse(candidate) as Partial<PlannerDecision>;
}

export async function POST(req: NextRequest) {
  try {
    if (PASSCODE && req.cookies.get(ACCESS_COOKIE)?.value !== "granted") {
      return new NextResponse("Presentation access is locked.", { status: 401 });
    }

    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not defined");
    }

    const body = await req.json().catch(() => ({}));
    const currentSegmentId = isPresentationSegmentId(body?.currentSegmentId)
      ? body.currentSegmentId
      : "opening_to_fit";
    const currentSegment = getPresentationSegment(currentSegmentId);
    const gateSectionId = String(body?.gateSectionId || currentSegment.gateSectionId) as PresentationSectionId;
    const allowedNextSegments = getAllowedNextSegments({ currentSegmentId, gateSectionId });
    const listenerChoice = String(body?.listenerChoice || "").slice(0, 500);
    const question = String(body?.question || "").slice(0, 300);
    const elapsedSeconds = Number.isFinite(Number(body?.elapsedSeconds))
      ? Math.max(0, Number(body.elapsedSeconds))
      : 0;
    const completedSections = Array.isArray(body?.completedSections)
      ? body.completedSections.map((section: unknown) => String(section)).slice(0, 12)
      : [];

    if (!allowedNextSegments.length) {
      const decision = coercePlannerDecision({
        currentSegmentId,
        gateSectionId,
        decision: {
          targetSegmentId: currentSegmentId,
          confidence: 1,
          strategy: "continue",
          presenterBrief: "Close the presentation calmly. Do not introduce a new section.",
          reason: "No downstream segment is available.",
        },
      });
      return NextResponse.json(decision);
    }

    const prompt = [
      "You are the supervisor planner for a live cinematic sales presentation for Beforest 10%.",
      "The realtime voice model is only the performer. You decide the next agenda beat after a modal answer.",
      "Return only JSON. No markdown. No prose outside JSON.",
      "",
      "Business goal:",
      "- Move the right viewer toward a Blyton Bungalow trial stay.",
      "- If the viewer is not ready, route softly to updates.",
      "- Keep momentum. Avoid over-explaining.",
      "",
      "Allowed targetSegmentId values for this decision:",
      JSON.stringify(allowedNextSegments),
      "",
      "Current state:",
      JSON.stringify({
        currentSegmentId,
        gateSectionId,
        completedSections,
        elapsedSeconds,
        question,
        listenerChoice,
      }),
      "",
      "Segment map:",
      JSON.stringify(PRESENTATION_SEGMENTS.map((segment) => ({
        id: segment.id,
        label: segment.stageLabel,
        sections: segment.sectionIds,
        gate: segment.gateSectionId,
      }))),
      "",
      "Decision policy:",
      "- If listener shows trial intent, choose the fastest allowed path toward decision_close.",
      "- If listener is confused about the model, choose membership_to_trial when allowed.",
      "- If listener wants feeling/reset/place proof, choose desire_to_proof when allowed.",
      "- If elapsedSeconds is above 140, compress aggressively toward decision_close when allowed.",
      "- Never choose a targetSegmentId outside the allowed values.",
      "",
      "JSON schema:",
      JSON.stringify({
        targetSegmentId: "one allowed target segment id",
        confidence: "number from 0 to 1",
        strategy: "continue | compress | clarify | trial_ready | updates_path",
        presenterBrief: "one short sentence telling the realtime presenter how to adapt the next act",
        reason: "short private reason for the routing decision",
      }),
    ].join("\n");

    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    const response = await ai.models.generateContent({
      model: PLANNER_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    let rawDecision: Partial<PlannerDecision> | null = null;
    try {
      rawDecision = parsePlannerJson(response.text || "{}");
    } catch {
      rawDecision = null;
    }

    const decision = coercePlannerDecision({
      currentSegmentId,
      gateSectionId,
      decision: rawDecision,
    });

    return NextResponse.json(decision);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to plan next presentation beat";
    return new NextResponse(message, { status: 500 });
  }
}
