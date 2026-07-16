import { NextRequest, NextResponse } from "next/server";
import {
  hasInviteCreatorSession,
  isCreatorKeyConfigured,
  isSameOriginRequest,
  isValidCreatorKey,
  setInviteCreatorSession,
} from "@/lib/invite-creator-auth";

export async function GET(request: NextRequest) {
  return NextResponse.json({ authorized: hasInviteCreatorSession(request) });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ authorized: false, error: "Invalid request origin." }, { status: 403 });
  }
  if (!isCreatorKeyConfigured()) {
    return NextResponse.json({ authorized: false, error: "Invite creator is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!isValidCreatorKey(key)) {
    return NextResponse.json({ authorized: false, error: "This creator link is not valid." }, { status: 401 });
  }

  const response = NextResponse.json({ authorized: true });
  setInviteCreatorSession(response);
  return response;
}
