import { NextRequest, NextResponse } from "next/server";
import { hasInviteCreatorSession, isSameOriginRequest } from "@/lib/invite-creator-auth";
import { parseInviteCreatorConfig } from "@/lib/invite-creator-config";
import { createSalesInvite } from "@/lib/invites";
import { getServerEnv } from "@/lib/server-env";

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request) || !hasInviteCreatorSession(request)) {
    return NextResponse.json({ error: "Open the private creator link again." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const inviteeName = clean(body?.inviteeName, 160);
  const inviteeEmail = clean(body?.inviteeEmail, 200).toLowerCase();
  const inviteePhone = clean(body?.inviteePhone, 80);
  if (!inviteeName) {
    return NextResponse.json({ error: "Add the recipient's name." }, { status: 400 });
  }
  if (!inviteeEmail && !inviteePhone) {
    return NextResponse.json({ error: "Add an email or phone number." }, { status: 400 });
  }

  const config = parseInviteCreatorConfig({
    uses: clean(body?.maxUses, 4),
    expires: clean(body?.expiryDays, 4),
    campaign: clean(body?.campaign, 80),
  });
  const expiresAt = new Date(Date.now() + config.expiryDays * 24 * 60 * 60 * 1000).toISOString();
  const configuredSiteUrl = getServerEnv("NEXT_PUBLIC_SITE_URL")?.trim();
  const requestSiteUrl = `${request.nextUrl.protocol}//${request.headers.get("x-forwarded-host") || request.nextUrl.host}`;

  try {
    const invite = await createSalesInvite({
      inviteeName,
      inviteeEmail,
      inviteePhone,
      campaign: config.campaign,
      source: "sales_link_generator",
      maxUses: config.maxUses,
      expiresAt,
      siteUrl: configuredSiteUrl || requestSiteUrl,
    });
    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    console.error("Sales invite creation failed", error);
    return NextResponse.json(
      { error: "Could not create the invite. Please try again." },
      { status: 500 },
    );
  }
}
