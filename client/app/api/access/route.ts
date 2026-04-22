import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "beforest_presentation_access";
const PASSCODE = process.env.PRESENTATION_PASSCODE?.trim() || "";

function hasAccessCookie(request: NextRequest) {
  return request.cookies.get(ACCESS_COOKIE)?.value === "granted";
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    requiresPasscode: Boolean(PASSCODE),
    authorized: !PASSCODE || hasAccessCookie(request),
  });
}

export async function POST(request: NextRequest) {
  if (!PASSCODE) {
    return NextResponse.json({ authorized: true, requiresPasscode: false });
  }

  const body = await request.json().catch(() => ({}));
  const submittedPasscode = typeof body?.passcode === "string" ? body.passcode.trim() : "";

  if (!submittedPasscode || submittedPasscode !== PASSCODE) {
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
