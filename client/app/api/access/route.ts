import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";
import {
  findInviteByPasscode,
  findInviteByToken,
  getInviteCookieValue,
  markInviteUsed,
  parseInviteCookieValue,
  type InviteIdentity,
} from "../../../lib/invites";

const ACCESS_COOKIE = "beforest_presentation_access";
const INVITE_COOKIE = "beforest_invite_identity";

function hasAccessCookie(request: NextRequest) {
  return request.cookies.get(ACCESS_COOKIE)?.value === "granted";
}

function getInviteFromCookie(request: NextRequest) {
  return parseInviteCookieValue(request.cookies.get(INVITE_COOKIE)?.value);
}

function getSlugInvite(token: string): InviteIdentity | null {
  const inviteId = token.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  if (!inviteId) {
    return null;
  }
  return {
    inviteId,
    inviteeName: "",
    inviteeEmail: "",
    inviteePhone: "",
    campaign: "",
    source: "url_slug",
  };
}

function setAccessCookies(response: NextResponse, invite?: InviteIdentity | null) {
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: "granted",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  if (invite) {
    response.cookies.set({
      name: INVITE_COOKIE,
      value: getInviteCookieValue(invite),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }
}

function accessResponse(body: Record<string, unknown>, invite?: InviteIdentity | null) {
  const response = NextResponse.json({
    ...body,
    invite: invite || null,
  });
  if (body.authorized) {
    setAccessCookies(response, invite);
  }
  return response;
}

export async function GET(request: NextRequest) {
  const passcode = getServerEnv("PRESENTATION_PASSCODE")?.trim() || "";
  const inviteToken = request.nextUrl.searchParams.get("invite")?.trim() || "";
  const inviteFromCookie = getInviteFromCookie(request);

  if (inviteToken) {
    const invite = await findInviteByToken(inviteToken).catch((error) => {
      console.warn("Invite token lookup failed; falling back to URL slug tracking", error);
      return null;
    }) || getSlugInvite(inviteToken);
    if (invite && invite.source !== "url_slug") {
      await markInviteUsed(invite);
    }
    if (invite) {
      return accessResponse({
        requiresPasscode: Boolean(passcode),
        authorized: invite.source === "url_slug" ? (!passcode || hasAccessCookie(request)) : true,
      }, invite);
    }
  }

  const authorized = !passcode || hasAccessCookie(request);
  return accessResponse({
    requiresPasscode: Boolean(passcode),
    authorized,
  }, inviteFromCookie);
}

export async function POST(request: NextRequest) {
  const passcode = getServerEnv("PRESENTATION_PASSCODE")?.trim() || "";
  const body = await request.json().catch(() => ({}));
  const submittedPasscode = typeof body?.passcode === "string" ? body.passcode.trim() : "";
  const invite = submittedPasscode
    ? await findInviteByPasscode(submittedPasscode).catch((error) => {
        console.error("Invite passcode lookup failed", error);
        return null;
      })
    : null;

  if (invite) {
    await markInviteUsed(invite);
    return accessResponse({ authorized: true, requiresPasscode: Boolean(passcode) }, invite);
  }

  if (!passcode) {
    return accessResponse({ authorized: true, requiresPasscode: false }, getInviteFromCookie(request));
  }

  if (!submittedPasscode || submittedPasscode !== passcode) {
    return NextResponse.json(
      { authorized: false, error: "That passcode does not match." },
      { status: 401 },
    );
  }

  return accessResponse({ authorized: true, requiresPasscode: true }, getInviteFromCookie(request));
}
