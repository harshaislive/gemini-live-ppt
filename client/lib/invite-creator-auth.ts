import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "./server-env";

export const INVITE_CREATOR_COOKIE = "beforest_invite_creator";
const SESSION_SECONDS = 60 * 60 * 12;

function getCreatorKey() {
  return getServerEnv("INVITE_CREATOR_KEY")?.trim() || "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getSessionValue() {
  const key = getCreatorKey();
  if (!key) {
    return "";
  }
  return createHmac("sha256", key).update("beforest-invite-creator:v1").digest("base64url");
}

export function isCreatorKeyConfigured() {
  return Boolean(getCreatorKey());
}

export function isValidCreatorKey(value: string) {
  const key = getCreatorKey();
  return Boolean(key && value && safeEqual(value, key));
}

export function hasInviteCreatorSession(request: NextRequest) {
  const expected = getSessionValue();
  const actual = request.cookies.get(INVITE_CREATOR_COOKIE)?.value || "";
  return Boolean(expected && actual && safeEqual(actual, expected));
}

export function setInviteCreatorSession(response: NextResponse) {
  response.cookies.set({
    name: INVITE_CREATOR_COOKIE,
    value: getSessionValue(),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
