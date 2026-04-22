import { RoomConfiguration } from "@livekit/protocol";
import { AccessToken, type AccessTokenOptions, type VideoGrant } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const ALLOW_INSECURE_LOCAL_TOKEN_ROUTE =
  process.env.ALLOW_INSECURE_LOCAL_TOKEN_ROUTE === "true";
const ACCESS_COOKIE = "beforest_presentation_access";
const PASSCODE = process.env.PRESENTATION_PASSCODE?.trim() || "";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development" && !ALLOW_INSECURE_LOCAL_TOKEN_ROUTE) {
    throw new Error(
      "This token route is for local development only. Add authentication before production use.",
    );
  }

  try {
    if (PASSCODE && req.cookies.get(ACCESS_COOKIE)?.value !== "granted") {
      return new NextResponse("Presentation access is locked.", { status: 401 });
    }

    if (!LIVEKIT_URL) {
      throw new Error("LIVEKIT_URL is not defined");
    }
    if (!API_KEY) {
      throw new Error("LIVEKIT_API_KEY is not defined");
    }
    if (!API_SECRET) {
      throw new Error("LIVEKIT_API_SECRET is not defined");
    }

    const body = await req.json();
    const roomConfig = body?.room_config
      ? RoomConfiguration.fromJson(body.room_config, { ignoreUnknownFields: true })
      : new RoomConfiguration();

    const participantName = body?.participantName || "Beforest Listener";
    const participantIdentity = body?.participantIdentity || "frontend";
    const roomName = `beforest-${Math.floor(Math.random() * 1_000_000)}`;

    const participantToken = await createParticipantToken(
      {
        identity: participantIdentity,
        name: participantName,
      },
      roomName,
      roomConfig,
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
      participantToken,
    };

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create token";
    return new NextResponse(message, { status: 500 });
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig: RoomConfiguration | undefined,
): Promise<string> {
  const accessToken = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: "15m",
  });

  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };

  accessToken.addGrant(grant);

  if (roomConfig) {
    accessToken.roomConfig = roomConfig;
  }

  return accessToken.toJwt();
}
