import { NextRequest, NextResponse } from "next/server";

function resolveBotBaseUrl() {
  const botStartUrl = process.env.BOT_START_URL || "http://localhost:7860/start";
  return botStartUrl.replace(/\/start\/?$/, "");
}

function buildHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.BOT_START_PUBLIC_API_KEY) {
    headers.Authorization = `Bearer ${process.env.BOT_START_PUBLIC_API_KEY}`;
  }

  return headers;
}

async function proxy(request: NextRequest, sessionId: string) {
  const botBaseUrl = resolveBotBaseUrl();
  const targetUrl = `${botBaseUrl}/sessions/${sessionId}/api/offer`;
  const body = await request.text();

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: buildHeaders(),
    body: body || undefined,
  });

  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await context.params;
  return proxy(request, sessionId);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await context.params;
  return proxy(request, sessionId);
}
