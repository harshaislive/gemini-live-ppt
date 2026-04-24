import { GoogleGenAI, Modality, type CreateAuthTokenConfig } from "@google/genai/node";
import { NextRequest, NextResponse } from "next/server";
import { buildSystemInstruction } from "@/lib/beforest-runtime";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_VOICE_ID = process.env.GOOGLE_VOICE_ID || "Gacrux";
const ACCESS_COOKIE = "beforest_presentation_access";
const PASSCODE = process.env.PRESENTATION_PASSCODE?.trim() || "";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    if (PASSCODE && req.cookies.get(ACCESS_COOKIE)?.value !== "granted") {
      return new NextResponse("Presentation access is locked.", { status: 401 });
    }

    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not defined");
    }

    const body = await req.json().catch(() => ({}));
    const listenerName = typeof body?.listenerName === "string" ? body.listenerName.trim() : "";
    const firstName = listenerName.split(/\s+/)[0] || "";

    const ai = new GoogleGenAI({
      apiKey: GOOGLE_API_KEY,
      apiVersion: "v1alpha",
    });

    const systemInstruction =
      buildSystemInstruction() +
      (firstName
        ? `\n\nListener note:\n- The current listener's first name is ${firstName}. Use their name sparingly and naturally when it helps warmth or clarity. Do not force it into every answer, every opening, or every close.`
        : "");

    const newSessionExpireTime = new Date(Date.now() + 1000 * 60).toISOString();
    const expireTime = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    const config: CreateAuthTokenConfig = {
      uses: 1,
      newSessionExpireTime,
      expireTime,
      liveConnectConstraints: {
        model: process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: GOOGLE_VOICE_ID,
              },
            },
          },
        },
      },
      lockAdditionalFields: [],
    };

    const token = await ai.authTokens.create({ config });
    return NextResponse.json({ name: token.name, newSessionExpireTime, expireTime });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Gemini token";
    return new NextResponse(message, { status: 500 });
  }
}
