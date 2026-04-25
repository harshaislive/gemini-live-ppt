import {
  ActivityHandling,
  GoogleGenAI,
  Modality,
  TurnCoverage,
  type CreateAuthTokenConfig,
} from "@google/genai/node";
import { NextRequest, NextResponse } from "next/server";
import { buildSystemInstruction, loadKnowledgeChunks } from "@/lib/beforest-runtime";
import { getServerEnv } from "@/lib/server-env";

const ACCESS_COOKIE = "beforest_presentation_access";

export const revalidate = 0;

function formatApprovedKnowledge(chunks: Awaited<ReturnType<typeof loadKnowledgeChunks>>) {
  return chunks
    .map((chunk) => `- ${chunk.source}/${chunk.section}: ${chunk.content}`)
    .join("\n")
    .slice(0, 9000);
}

export async function POST(req: NextRequest) {
  try {
    const passcode = getServerEnv("PRESENTATION_PASSCODE")?.trim() || "";
    const googleApiKey = getServerEnv("GOOGLE_API_KEY");
    const googleVoiceId = getServerEnv("GOOGLE_VOICE_ID") || "Gacrux";
    const liveModel = getServerEnv("GEMINI_LIVE_MODEL") || "gemini-2.5-flash-native-audio-preview-12-2025";

    if (passcode && req.cookies.get(ACCESS_COOKIE)?.value !== "granted") {
      return new NextResponse("Presentation access is locked.", { status: 401 });
    }

    if (!googleApiKey) {
      throw new Error("GOOGLE_API_KEY is not defined");
    }

    const body = await req.json().catch(() => ({}));
    const listenerName = typeof body?.listenerName === "string" ? body.listenerName.trim() : "";
    const firstName = listenerName.split(/\s+/)[0] || "";
    const runtimeContext = typeof body?.runtimeContext === "string"
      ? body.runtimeContext.trim().slice(0, 4000)
      : "";

    const ai = new GoogleGenAI({
      apiKey: googleApiKey,
      apiVersion: "v1alpha",
    });

    const approvedKnowledge = formatApprovedKnowledge(await loadKnowledgeChunks());

    const systemInstruction =
      buildSystemInstruction() +
      `\n\nApproved Beforest knowledge available for listener interruptions:\n${approvedKnowledge}\n\nGrounding rule:\n- Use this approved knowledge to answer factual questions, including questions about Blyton Bungalow.\n- If asked where Blyton Bungalow is, answer directly: Blyton Bungalow is in Coorg, and it is the pilot trial stay path.\n- Do not say you lack information when the answer appears in the approved knowledge above.` +
      (firstName
        ? `\n\nListener note:\n- The current listener's first name is ${firstName}. Use their name sparingly and naturally when it helps warmth or clarity. Do not force it into every answer, every opening, or every close.`
        : "") +
      (runtimeContext
        ? `\n\nCurrent controlled presentation state:\n${runtimeContext}\n\nInterruption rule:\n- The main narrator is paused while the listener asks a question.\n- Answer only the listener's question, briefly and concretely.\n- Do not continue the main presentation.\n- End by handing back to the narrator with the provided return line or a close natural variant.`
        : "");

    const newSessionExpireTime = new Date(Date.now() + 1000 * 60).toISOString();
    const expireTime = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    const config: CreateAuthTokenConfig = {
      uses: 1,
      newSessionExpireTime,
      expireTime,
      liveConnectConstraints: {
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: true,
            },
            activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
          },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: googleVoiceId,
              },
            },
          },
        },
      },
      lockAdditionalFields: [],
    };

    const token = await ai.authTokens.create({ config });
    return NextResponse.json({ name: token.name, model: liveModel, newSessionExpireTime, expireTime });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Gemini token";
    return new NextResponse(message, { status: 500 });
  }
}
