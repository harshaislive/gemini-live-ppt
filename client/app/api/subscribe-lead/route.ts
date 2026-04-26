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

async function persistLead(lead: LeadPayload) {
  const webhookUrl = getServerEnv("SUBSCRIBE_LEAD_WEBHOOK_URL")?.trim();
  const event = {
    ...lead,
    source: "beforest-live-guide",
    capturedAt: new Date().toISOString(),
  };

  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new Error("Lead webhook failed.");
    }
    return;
  }

  const dir = path.resolve(process.cwd(), ".leads");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "beforest-updates.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const lead = validateLead(body as Record<string, unknown>);
    await persistLead(lead);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to capture subscribe lead", error);
    return NextResponse.json({ error: "Could not save this update request." }, { status: 400 });
  }
}
