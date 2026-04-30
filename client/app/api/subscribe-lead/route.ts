import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";
import { appendJsonlFallback, insertSupabaseRows } from "../../../lib/supabase-rest";

export const revalidate = 0;
export const runtime = "nodejs";

type LeadPayload = {
  name: string;
  email: string;
  phone: string;
  interest: string;
  timing: string;
  firstUpdate: string;
  inviteId: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string;
  campaign: string;
  source: string;
};

const DEFAULT_SUBSCRIBE_LEAD_WEBHOOK_URL = "https://windmill.devsharsha.live/api/w/beforest-automations/jobs/run/f/u/harsha/8AtQ5flwFWeX";
const DEFAULT_SUBSCRIBE_LEADS_TABLE = "beforest_subscribe_leads";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 300) : "";
}

function validateLead(body: Record<string, unknown>): LeadPayload {
  const lead = {
    name: clean(body.name),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    interest: clean(body.interest),
    timing: clean(body.timing),
    firstUpdate: clean(body.firstUpdate),
    inviteId: clean(body.inviteId),
    inviteeName: clean(body.inviteeName),
    inviteeEmail: clean(body.inviteeEmail).toLowerCase(),
    inviteePhone: clean(body.inviteePhone),
    campaign: clean(body.campaign),
    source: clean(body.source),
  };

  if (!lead.name || !lead.email || !lead.phone) {
    throw new Error("Name, email, and phone are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    throw new Error("A valid email is required.");
  }
  return lead;
}

async function persistLead(lead: LeadPayload) {
  const webhookUrl = getServerEnv("SUBSCRIBE_LEAD_WEBHOOK_URL")?.trim()
    || DEFAULT_SUBSCRIBE_LEAD_WEBHOOK_URL;
  const supabaseTable = getServerEnv("SUPABASE_SUBSCRIBE_LEADS_TABLE")?.trim()
    || DEFAULT_SUBSCRIBE_LEADS_TABLE;
  const event = {
    ...lead,
    source: lead.source || "beforest-live-guide",
    capturedAt: new Date().toISOString(),
  };
  let captured = false;
  let supabaseCaptured = false;
  let webhookCaptured = false;

  try {
    const result = await insertSupabaseRows(supabaseTable, {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      interest: lead.interest,
      timing: lead.timing,
      first_update: lead.firstUpdate,
      source: event.source,
      invite_id: lead.inviteId,
      invitee_name: lead.inviteeName,
      invitee_email: lead.inviteeEmail,
      invitee_phone: lead.inviteePhone,
      campaign: lead.campaign,
      captured_at: event.capturedAt,
      payload: event,
    });
    supabaseCaptured = result.captured;
    captured = captured || result.captured;
  } catch (error) {
    console.error("Lead Supabase insert failed", error);
  }

  if (webhookUrl && webhookUrl !== "file://local" && webhookUrl !== "local") {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (response.ok) {
        webhookCaptured = true;
        captured = true;
      } else {
        console.error("Lead webhook failed", response.status);
      }
    } catch (error) {
      console.error("Lead webhook failed", error);
    }
  }

  if (captured) {
    return { captured: true, fallback: false, supabaseCaptured, webhookCaptured };
  }

  try {
    await appendJsonlFallback("beforest-updates.jsonl", event);
    return { captured: true, fallback: true, supabaseCaptured, webhookCaptured };
  } catch (error) {
    console.error("Failed to capture subscribe lead locally", error);
    return { captured: false, fallback: true, supabaseCaptured, webhookCaptured };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const lead = validateLead(body as Record<string, unknown>);
    const result = await persistLead(lead);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Failed to capture subscribe lead", error);
    return NextResponse.json({ error: "Could not save this update request." }, { status: 400 });
  }
}
