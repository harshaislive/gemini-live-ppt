import { NextRequest, NextResponse } from "next/server";
import { appendJsonlFallback, insertSupabaseRows } from "../../../lib/supabase-rest";
import { getServerEnv } from "@/lib/server-env";
import { parseInviteCookieValue } from "../../../lib/invites";

export const revalidate = 0;
export const runtime = "nodejs";

type AnalyticsPayload = {
  eventType: string;
  eventName: string;
  sessionId: string;
  listenerName: string;
  slideId: string;
  slideLabel: string;
  visualId: string;
  inviteId: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string;
  campaign: string;
  source: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

type LeadSignal = {
  scoreDelta: number;
  temperature: "cold" | "engaged" | "warm" | "hot";
  reasons: string[];
};

const DEFAULT_INTERACTIONS_TABLE = "beforest_interactions";
const DEFAULT_SLIDE_METRICS_TABLE = "beforest_slide_metrics";
const DEFAULT_QUESTIONS_TABLE = "beforest_questions";
const DEFAULT_FAQ_METRICS_TABLE = "beforest_faq_metrics";
const DEFAULT_SESSION_SIGNALS_TABLE = "beforest_session_signals";

function clean(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getStringEnv(name: string, fallback: string) {
  return getServerEnv(name)?.trim() || fallback;
}

function getLeadSignal(event: AnalyticsPayload): LeadSignal {
  const payload = event.payload;
  const reasons: string[] = [];
  let scoreDelta = 0;

  function add(points: number, reason: string) {
    scoreDelta += points;
    reasons.push(reason);
  }

  if (event.eventName === "trial_stay_clicked") {
    add(35, "clicked trial stay");
  }
  if (event.eventName === "subscribe_lead_completed") {
    add(30, "completed subscribe form");
  }
  if (event.eventName === "subscribe_contact_submitted") {
    add(15, "shared contact details");
  }
  if (event.eventName === "question_asked") {
    add(12, "asked live question");
  }
  if (event.eventName === "question_answered") {
    add(8, "stayed for live answer");
  }
  if (event.eventName === "presentation_completed") {
    add(20, "completed presentation");
  }
  if (event.eventName === "faq_opened") {
    add(8, "opened FAQ");
  }
  if (event.eventName === "faq_audio_played") {
    add(5, "played FAQ answer");
  }
  if (event.eventName === "faq_audio_completed") {
    add(10, "completed FAQ answer audio");
  }
  if (event.eventType === "slide_metric" && payload.completed) {
    add(6, "completed slide");
  }
  if (event.slideId === "blyton_first" || event.slideId === "decision_close") {
    add(8, "reached high-intent slide");
  }

  const durationMs = Number(payload.durationMs);
  if (event.eventType === "faq_metric" && Number.isFinite(durationMs) && durationMs >= 15000) {
    add(8, "spent 15s+ in FAQ");
  }
  if (event.eventType === "slide_metric" && Number.isFinite(durationMs) && durationMs >= 25000) {
    add(4, "spent 25s+ on slide");
  }

  if (clean(payload.interest, 120).toLowerCase().includes("blyton")) {
    add(15, "Blyton interest");
  } else if (clean(payload.interest, 120).toLowerCase().includes("10%")) {
    add(10, "10% membership interest");
  }

  const timing = clean(payload.timing, 120).toLowerCase();
  if (timing.includes("next 30")) {
    add(20, "next 30 days timing");
  } else if (timing.includes("1-3")) {
    add(12, "1-3 month timing");
  } else if (timing.includes("later this year")) {
    add(6, "later this year timing");
  }

  if (event.eventName === "subscribe_closed" && !payload.completed) {
    add(-3, "closed subscribe before completion");
  }
  if (event.eventName === "subscribe_back_clicked") {
    add(-1, "moved back in subscribe flow");
  }

  const temperature = scoreDelta >= 35
    ? "hot"
    : scoreDelta >= 15
      ? "warm"
      : scoreDelta > 0
        ? "engaged"
        : "cold";

  return { scoreDelta, temperature, reasons };
}

function normalizeEvent(body: Record<string, unknown>, cookieInvite: ReturnType<typeof parseInviteCookieValue>): AnalyticsPayload {
  const eventType = clean(body.eventType, 80) || "interaction";
  const eventName = clean(body.eventName, 120) || eventType;
  const sessionId = clean(body.sessionId, 120);
  if (!sessionId) {
    throw new Error("sessionId is required.");
  }

  const occurredAt = clean(body.occurredAt, 80);
  const parsedOccurredAt = occurredAt ? Date.parse(occurredAt) : NaN;

  return {
    eventType,
    eventName,
    sessionId,
    listenerName: clean(body.listenerName, 160),
    slideId: clean(body.slideId, 120),
    slideLabel: clean(body.slideLabel, 160),
    visualId: clean(body.visualId, 120),
    inviteId: clean(body.inviteId, 120) || cookieInvite?.inviteId || "",
    inviteeName: clean(body.inviteeName, 160) || cookieInvite?.inviteeName || "",
    inviteeEmail: clean(body.inviteeEmail, 200).toLowerCase() || cookieInvite?.inviteeEmail || "",
    inviteePhone: clean(body.inviteePhone, 80) || cookieInvite?.inviteePhone || "",
    campaign: clean(body.campaign, 160) || cookieInvite?.campaign || "",
    source: clean(body.source, 160) || cookieInvite?.source || "",
    occurredAt: Number.isFinite(parsedOccurredAt) ? new Date(parsedOccurredAt).toISOString() : new Date().toISOString(),
    payload: cleanPayload(body.payload),
  };
}

function toInteractionRow(event: AnalyticsPayload, signal: LeadSignal) {
  return {
    session_id: event.sessionId,
    listener_name: event.listenerName,
    event_type: event.eventType,
    event_name: event.eventName,
    slide_id: event.slideId,
    slide_label: event.slideLabel,
    visual_id: event.visualId,
    invite_id: event.inviteId,
    invitee_name: event.inviteeName,
    invitee_email: event.inviteeEmail,
    invitee_phone: event.inviteePhone,
    campaign: event.campaign,
    invite_source: event.source,
    lead_score_delta: signal.scoreDelta,
    lead_temperature: signal.temperature,
    lead_reasons: signal.reasons,
    payload: event.payload,
    occurred_at: event.occurredAt,
  };
}

function toSlideMetricRow(event: AnalyticsPayload, signal: LeadSignal) {
  const payload = event.payload;
  return {
    session_id: event.sessionId,
    listener_name: event.listenerName,
    slide_id: event.slideId,
    slide_label: event.slideLabel,
    visual_id: event.visualId,
    invite_id: event.inviteId,
    invitee_name: event.inviteeName,
    invitee_email: event.inviteeEmail,
    invitee_phone: event.inviteePhone,
    campaign: event.campaign,
    invite_source: event.source,
    started_at: clean(payload.startedAt, 80) || null,
    ended_at: clean(payload.endedAt, 80) || event.occurredAt,
    duration_ms: Number.isFinite(Number(payload.durationMs)) ? Math.max(0, Math.round(Number(payload.durationMs))) : null,
    max_elapsed_seconds: Number.isFinite(Number(payload.maxElapsedSeconds))
      ? Math.max(0, Number(payload.maxElapsedSeconds))
      : null,
    completed: Boolean(payload.completed),
    exit_reason: clean(payload.exitReason, 120),
    lead_score_delta: signal.scoreDelta,
    lead_temperature: signal.temperature,
    lead_reasons: signal.reasons,
    payload,
    occurred_at: event.occurredAt,
  };
}

function toQuestionRow(event: AnalyticsPayload, signal: LeadSignal) {
  const payload = event.payload;
  return {
    session_id: event.sessionId,
    listener_name: event.listenerName,
    slide_id: event.slideId,
    slide_label: event.slideLabel,
    visual_id: event.visualId,
    invite_id: event.inviteId,
    invitee_name: event.inviteeName,
    invitee_email: event.inviteeEmail,
    invitee_phone: event.inviteePhone,
    campaign: event.campaign,
    invite_source: event.source,
    question: clean(payload.question, 2000),
    answer: clean(payload.answer, 4000),
    source: clean(payload.source, 120) || "live_mic",
    lead_score_delta: signal.scoreDelta,
    lead_temperature: signal.temperature,
    lead_reasons: signal.reasons,
    payload,
    occurred_at: event.occurredAt,
  };
}

function toFaqMetricRow(event: AnalyticsPayload, signal: LeadSignal) {
  const payload = event.payload;
  return {
    session_id: event.sessionId,
    listener_name: event.listenerName,
    slide_id: event.slideId,
    slide_label: event.slideLabel,
    visual_id: event.visualId,
    invite_id: event.inviteId,
    invitee_name: event.inviteeName,
    invitee_email: event.inviteeEmail,
    invitee_phone: event.inviteePhone,
    campaign: event.campaign,
    invite_source: event.source,
    faq_id: clean(payload.faqId, 160),
    question: clean(payload.question, 1000),
    action: event.eventName,
    started_at: clean(payload.startedAt, 80) || null,
    ended_at: clean(payload.endedAt, 80) || event.occurredAt,
    duration_ms: Number.isFinite(Number(payload.durationMs)) ? Math.max(0, Math.round(Number(payload.durationMs))) : null,
    completed: Boolean(payload.completed),
    lead_score_delta: signal.scoreDelta,
    lead_temperature: signal.temperature,
    lead_reasons: signal.reasons,
    payload,
    occurred_at: event.occurredAt,
  };
}

function toSessionSignalRow(event: AnalyticsPayload, signal: LeadSignal) {
  return {
    session_id: event.sessionId,
    listener_name: event.listenerName,
    event_type: event.eventType,
    event_name: event.eventName,
    slide_id: event.slideId,
    slide_label: event.slideLabel,
    visual_id: event.visualId,
    invite_id: event.inviteId,
    invitee_name: event.inviteeName,
    invitee_email: event.inviteeEmail,
    invitee_phone: event.inviteePhone,
    campaign: event.campaign,
    invite_source: event.source,
    lead_score_delta: signal.scoreDelta,
    lead_temperature: signal.temperature,
    lead_reasons: signal.reasons,
    payload: event.payload,
    occurred_at: event.occurredAt,
  };
}

async function persistEvent(event: AnalyticsPayload) {
  const writes: Promise<unknown>[] = [];
  const interactionTable = getStringEnv("SUPABASE_INTERACTIONS_TABLE", DEFAULT_INTERACTIONS_TABLE);
  const signal = getLeadSignal(event);

  writes.push(insertSupabaseRows(interactionTable, toInteractionRow(event, signal)));
  writes.push(insertSupabaseRows(
    getStringEnv("SUPABASE_SESSION_SIGNALS_TABLE", DEFAULT_SESSION_SIGNALS_TABLE),
    toSessionSignalRow(event, signal),
  ));

  if (event.eventType === "slide_metric") {
    writes.push(insertSupabaseRows(
      getStringEnv("SUPABASE_SLIDE_METRICS_TABLE", DEFAULT_SLIDE_METRICS_TABLE),
      toSlideMetricRow(event, signal),
    ));
  }

  if (event.eventType === "question") {
    writes.push(insertSupabaseRows(
      getStringEnv("SUPABASE_QUESTIONS_TABLE", DEFAULT_QUESTIONS_TABLE),
      toQuestionRow(event, signal),
    ));
  }

  if (event.eventType === "faq_metric") {
    writes.push(insertSupabaseRows(
      getStringEnv("SUPABASE_FAQ_METRICS_TABLE", DEFAULT_FAQ_METRICS_TABLE),
      toFaqMetricRow(event, signal),
    ));
  }

  const results = await Promise.allSettled(writes);
  const captured = results.some((result) => (
    result.status === "fulfilled"
    && typeof result.value === "object"
    && result.value
    && "captured" in result.value
    && result.value.captured
  ));

  if (captured) {
    return { captured: true, fallback: false };
  }

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Analytics Supabase insert failed", result.reason);
    }
  });

  try {
    await appendJsonlFallback("beforest-analytics.jsonl", event);
    return { captured: true, fallback: true };
  } catch (error) {
    console.error("Failed to capture analytics locally", error);
    return { captured: false, fallback: true };
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieInvite = parseInviteCookieValue(req.cookies.get("beforest_invite_identity")?.value);
    const body = await req.json().catch(() => ({}));
    const rawEvents = Array.isArray((body as Record<string, unknown>).events)
      ? (body as { events: unknown[] }).events
      : [body];
    const events = rawEvents
      .filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === "object" && !Array.isArray(event))
      .slice(0, 25)
      .map((event) => normalizeEvent(event, cookieInvite));

    if (!events.length) {
      throw new Error("At least one analytics event is required.");
    }

    const results = await Promise.all(events.map(persistEvent));
    return NextResponse.json({
      ok: true,
      captured: results.some((result) => result.captured),
      fallback: results.some((result) => result.fallback),
    });
  } catch (error) {
    console.error("Failed to capture analytics event", error);
    return NextResponse.json({ error: "Could not save analytics event." }, { status: 400 });
  }
}
