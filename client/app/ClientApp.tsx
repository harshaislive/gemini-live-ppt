"use client";

import { RoomAudioRenderer, RoomContext, useSession } from "@livekit/components-react";
import { LoaderCircle, Mic, MicOff } from "lucide-react";
import Image from "next/image";
import {
  ConnectionState,
  RoomEvent,
  RpcInvocationData,
  TokenSource,
  type Participant,
  type TranscriptionSegment,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { INITIAL_VISUAL, type BeforestVisual } from "./beforest";

interface ClientAppProps {
  isMobile: boolean;
}

type ShowImagePayload = Partial<BeforestVisual> & {
  imageUrl?: string;
  hook?: string;
  note?: string;
  alt?: string;
};

function toWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function takeLastWords(text: string, maxWords: number) {
  const words = toWords(text);

  if (words.length <= maxWords) {
    return words.join(" ");
  }

  return words.slice(-maxWords).join(" ");
}

function mergeRollingWords(previous: string, next: string, maxWords: number) {
  const nextWords = toWords(next);

  if (nextWords.length === 0) {
    return previous;
  }

  if (nextWords.length >= maxWords) {
    return nextWords.slice(-maxWords).join(" ");
  }

  const previousWords = toWords(previous);
  const maxOverlap = Math.min(previousWords.length, nextWords.length);
  let overlap = 0;

  for (let size = maxOverlap; size > 0; size -= 1) {
    const previousTail = previousWords.slice(-size).join(" ").toLowerCase();
    const nextHead = nextWords.slice(0, size).join(" ").toLowerCase();

    if (previousTail === nextHead) {
      overlap = size;
      break;
    }
  }

  const mergedWords = [...previousWords, ...nextWords.slice(overlap)];
  return mergedWords.slice(-maxWords).join(" ");
}

function applyVisualPayload(current: BeforestVisual, payload: ShowImagePayload): BeforestVisual {
  return {
    ...current,
    ...payload,
    id: payload.id ?? current.id,
    title: payload.title ?? current.title,
    imageUrl: payload.imageUrl ?? current.imageUrl,
    hook: payload.hook ?? current.hook,
    note: payload.note ?? current.note,
    alt: payload.alt ?? current.alt,
    tags: payload.tags ?? current.tags,
    bestFor: payload.bestFor ?? current.bestFor,
  };
}

export const ClientApp: React.FC<ClientAppProps> = ({ isMobile }) => {
  const tokenSource = useMemo(() => TokenSource.endpoint("/api/token"), []);
  const session = useSession(tokenSource, {
    agentName: process.env.NEXT_PUBLIC_LIVEKIT_AGENT_NAME || "beforest-guide",
    participantIdentity: process.env.NEXT_PUBLIC_LIVEKIT_FRONTEND_IDENTITY || "frontend",
    participantName: "Beforest Listener",
  });

  const room = session.room;

  const [isStarting, setIsStarting] = useState(false);
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isPressingMic, setIsPressingMic] = useState(false);
  const [botTtsTranscript, setBotTtsTranscript] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [visual, setVisual] = useState<BeforestVisual>(INITIAL_VISUAL);
  const [uiError, setUiError] = useState<string | null>(null);

  const isLive = session.connectionState === ConnectionState.Connected;
  const isBusy = session.connectionState === ConnectionState.Connecting || isStarting;

  const displayedSubtitle = useMemo(() => {
    if (isUserSpeaking) {
      return takeLastWords(userTranscript.trim(), 3) || "Listening...";
    }

    if (botTtsTranscript.trim()) {
      return takeLastWords(botTtsTranscript.trim(), 3);
    }

    if (uiError) {
      return "Connection failed. Tap the mic to try again.";
    }

    if (isBusy) {
      return "Connecting to Gemini Live...";
    }

    if (isLive) {
      return visual.note;
    }

    if (hasEverConnected) {
      return "Tap the mic to reconnect.";
    }

    return "Tap the mic to begin the live walkthrough.";
  }, [botTtsTranscript, hasEverConnected, isBusy, isLive, isUserSpeaking, uiError, userTranscript, visual.note]);

  const handleShowImageRpc = useCallback(
    async (data: RpcInvocationData) => {
      const payload = JSON.parse(data.payload || "{}") as ShowImagePayload;
      setVisual((current) => applyVisualPayload(current, payload));
      return JSON.stringify({ status: "ok" });
    },
    [],
  );

  useEffect(() => {
    room.registerRpcMethod("show_image", handleShowImageRpc);

    return () => {
      room.unregisterRpcMethod("show_image");
    };
  }, [handleShowImageRpc, room]);

  useEffect(() => {
    if (isLive) {
      setHasEverConnected(true);
      setIsStarting(false);
      setUiError(null);
    }
  }, [isLive]);

  useEffect(() => {
    const handleDisconnected = () => {
      setIsBotSpeaking(false);
      setIsUserSpeaking(false);
      setIsPressingMic(false);
    };

    const handleActiveSpeakersChanged = (participants: Participant[]) => {
      const localIdentity = room.localParticipant.identity;
      setIsUserSpeaking(participants.some((participant) => participant.identity === localIdentity));
      setIsBotSpeaking(participants.some((participant) => participant.identity !== localIdentity));
    };

    const handleTranscriptionReceived = (
      segments: TranscriptionSegment[],
      participant?: Participant,
    ) => {
      const text = segments.map((segment) => segment.text).join(" ").trim();
      if (!text || !participant) {
        return;
      }

      if (participant.identity === room.localParticipant.identity) {
        setUserTranscript(text);
        return;
      }

      setBotTtsTranscript((previous) => mergeRollingWords(previous, text, 3));
    };

    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
    room.on(RoomEvent.TranscriptionReceived, handleTranscriptionReceived);

    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnected);
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
      room.off(RoomEvent.TranscriptionReceived, handleTranscriptionReceived);
    };
  }, [room]);

  useEffect(() => {
    if (!isLive || isPressingMic) {
      return;
    }

    void room.localParticipant.setMicrophoneEnabled(false);
  }, [isLive, isPressingMic, room]);

  async function handleStart() {
    if (isBusy) {
      return;
    }

    setIsStarting(true);
    setUiError(null);
    setBotTtsTranscript("");
    setUserTranscript("");

    try {
      await room.startAudio();
      await session.start({
        tracks: {
          microphone: {
            enabled: false,
          },
        },
      });
    } catch (connectError) {
      setUiError(
        connectError instanceof Error
          ? connectError.message
          : "Unable to begin the live walkthrough.",
      );
      setIsStarting(false);
    }
  }

  function handlePrimaryAction() {
    if (isLive) {
      return;
    }

    void handleStart();
  }

  function handleMicPointerDown() {
    if (!isLive || isBusy || isStarting) {
      return;
    }

    setIsPressingMic(true);
    void room.localParticipant.setMicrophoneEnabled(true);
  }

  function handleMicPointerUp() {
    setIsPressingMic(false);

    if (!isLive) {
      return;
    }

    void room.localParticipant.setMicrophoneEnabled(false);
  }

  const actionLabel = isBusy
    ? "Connecting"
    : isLive
      ? "Hold to talk, release to send"
      : "Begin live walkthrough";

  return (
    <RoomContext.Provider value={room}>
      <main className="beforest-shell">
        <div className="beforest-noise" aria-hidden="true" />

        <section className="beforest-story" aria-label="Beforest live walkthrough">
          <Image
            key={visual.id || visual.imageUrl}
            src={visual.imageUrl}
            alt={visual.alt}
            fill
            priority
            unoptimized
            className="beforest-story__image"
            sizes={isMobile ? "100vw" : "100vw"}
          />

          <div className="beforest-story__scrim" aria-hidden="true" />

          <div className="beforest-story__overlay">
            <header className="beforest-heading" aria-live="polite">
              <h1 className="beforest-heading__title">{visual.hook}</h1>
            </header>

            <div className="beforest-bottom-ui">
              {uiError ? (
                <p className="beforest-inline-error" role="alert">
                  {uiError}
                </p>
              ) : null}

              <p
                className={`beforest-subtitle${displayedSubtitle ? " visible" : ""}`}
                aria-live="polite"
              >
                {displayedSubtitle}
              </p>

              <button
                type="button"
                className={[
                  "beforest-mic-button",
                  isPressingMic ? "is-open" : "",
                  isBusy ? "is-busy" : "",
                  isBotSpeaking ? "is-speaking" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={handlePrimaryAction}
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={handleMicPointerUp}
                onPointerLeave={handleMicPointerUp}
                disabled={isBusy}
                aria-label={actionLabel}
                aria-pressed={isLive ? isPressingMic : undefined}
              >
                <span className="beforest-mic-button__ring" aria-hidden="true" />
                <span className="beforest-mic-button__surface">
                  {isBusy ? (
                    <LoaderCircle size={24} className="spin" />
                  ) : isLive && !isPressingMic ? (
                    <MicOff size={24} />
                  ) : (
                    <Mic size={24} />
                  )}
                </span>
              </button>
            </div>

            <div className="beforest-screen-frame" aria-hidden="true" />
          </div>
        </section>

        <RoomAudioRenderer />
      </main>
    </RoomContext.Provider>
  );
};
