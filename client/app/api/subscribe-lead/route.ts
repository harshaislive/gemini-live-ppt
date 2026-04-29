import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";

export const revalidate = 0;
export const runtime = "nodejs";

type LeadPayload = {
  name: string;
  email: string;
  phone: string;
  interest: string;
  timing: string;
  firstUpdate: string;
};

const DEFAULT_SUBSCRIBE_LEAD_WEBHOOK_URL = "https://windmill.devsharsha.live/api/w/beforest-automations/jobs/run/f/u/harsha/8AtQ5flwFWeX";

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
  };

  if (!lead.name || !lead.email || !lead.phone) {
    throw new Error("Name, email, and phone are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    throw new Error("A valid email is required.");
  }
  return lead;
}

async function appendLeadLocally(event: LeadPayload & { source: string; capturedAt: string }) {
  const dir = path.resolve(process.cwd(), ".leads");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "beforest-updates.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
}

async function persistLead(lead: LeadPayload) {
  const webhookUrl = getServerEnv("SUBSCRIBE_LEAD_WEBHOOK_URL")?.trim()
    || DEFAULT_SUBSCRIBE_LEAD_WEBHOOK_URL;
  const event = {
    ...lead,
    source: "beforest-live-guide",
    capturedAt: new Date().toISOString(),
  };

  if (webhookUrl && webhookUrl !== "file://local" && webhookUrl !== "local") {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (response.ok) {
        return { captured: true, fallback: false };
      }
      console.error("Lead webhook failed", response.status);
    } catch (error) {
      console.error("Lead webhook failed", error);
    }
  }

  try {
    await appendLeadLocally(event);
    return { captured: true, fallback: true };
  } catch (error) {
    console.error("Failed to capture subscribe lead locally", error);
    return { captured: false, fallback: true };
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
