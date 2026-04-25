import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";

const ACCESS_COOKIE = "beforest_presentation_access";

function hasAccessCookie(request: NextRequest) {
  return request.cookies.get(ACCESS_COOKIE)?.value === "granted";
}

export async function GET(request: NextRequest) {
  const passcode = getServerEnv("PRESENTATION_PASSCODE")?.trim() || "";
  return NextResponse.json({
    requiresPasscode: Boolean(passcode),
    authorized: !passcode || hasAccessCookie(request),
  });
}

export async function POST(request: NextRequest) {
  const passcode = getServerEnv("PRESENTATION_PASSCODE")?.trim() || "";
  if (!passcode) {
    return NextResponse.json({ authorized: true, requiresPasscode: false });
  }

  const body = await request.json().catch(() => ({}));
  const submittedPasscode = typeof body?.passcode === "string" ? body.passcode.trim() : "";

  if (!submittedPasscode || submittedPasscode !== passcode) {
    return NextResponse.json(
      { authorized: false, error: "That passcode does not match." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ authorized: true, requiresPasscode: true });
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: "granted",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
