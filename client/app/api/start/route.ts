import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Use BOT_START_URL from environment or fallback to localhost
  const botStartUrl =
    process.env.BOT_START_URL || "http://localhost:7860/start";

  try {
    // Prepare headers - make API key optional
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Only add Authorization header if API key is provided
    if (process.env.BOT_START_PUBLIC_API_KEY) {
      headers.Authorization = `Bearer ${process.env.BOT_START_PUBLIC_API_KEY}`;
    }

    const requestBody = (await request.json().catch(() => null)) ?? {
      enableDefaultIceServers: true,
    };

    const response = await fetch(botStartUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Log detailed error server-side
      const errorText = await response.text().catch(() => response.statusText);
      console.error("Pipecat API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      const normalizedError = errorText?.trim();
      if (
        response.status === 500 &&
        (!normalizedError || normalizedError === "Internal Server Error")
      ) {
        throw new Error(
          "Pipecat bot could not start. Check server/.env for DAILY_API_KEY or DAILY_ROOM_URL."
        );
      }

      throw new Error(normalizedError || `Failed to connect to Pipecat: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      // Log error details server-side
      console.error("Pipecat API returned error:", data.error);
      throw new Error(data.error);
    }

    return NextResponse.json(data);
  } catch (error) {
    // Log full error details server-side for debugging
    console.error("API route error:", error);

    // Return generic error message to client (don't expose internal details)
    const errorMessage =
      error instanceof Error ? error.message : "Failed to process connection request";

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
