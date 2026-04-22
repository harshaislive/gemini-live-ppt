"use client";

import { RoomAudioRenderer, RoomContext, useSession } from "@livekit/components-react";
import { LoaderCircle, Mic, MicOff } from "lucide-react";
import Image from "next/image";
import {
  ConnectionState,
  RoomEvent,
  RpcInvocationData,
  Room,
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

type AccessState = {
  requiresPasscode: boolean;
  authorized: boolean;
};

const LISTENER_NAME_STORAGE_KEY = "beforest_listener_name";

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

function getMicCapabilityError() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.isSecureContext) {
    return "Microphone access needs a secure page. Open this app on localhost or HTTPS/Tailscale Serve and try again.";
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser cannot open the microphone here. Try Chrome on localhost or an HTTPS URL.";
  }

  return null;
}

function getAgentIdentity(room: Room) {
  const remoteParticipant = Array.from(room.remoteParticipants.values())[0];
  return remoteParticipant?.identity ?? null;
}

export const ClientApp: React.FC<ClientAppProps> = ({ isMobile }) => {
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [listenerName, setListenerName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const tokenSource = useMemo(() => TokenSource.endpoint("/api/token"), []);
  const session = useSession(tokenSource, {
    agentName: process.env.NEXT_PUBLIC_LIVEKIT_AGENT_NAME || "beforest-guide",
    participantIdentity: process.env.NEXT_PUBLIC_LIVEKIT_FRONTEND_IDENTITY || "frontend",
    participantName: listenerName.trim() || "Beforest Listener",
  });

  const room = session.room;

  const [isStarting, setIsStarting] = useState(false);
  const [isMicTransitioning, setIsMicTransitioning] = useState(false);
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [botTtsTranscript, setBotTtsTranscript] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [visual, setVisual] = useState<BeforestVisual>(INITIAL_VISUAL);
  const [uiError, setUiError] = useState<string | null>(null);

  const isAccessReady = Boolean(accessState?.authorized && listenerName.trim());
  const shouldShowNameForm = Boolean(accessState && !listenerName.trim());
  const shouldShowAccessForm = Boolean(accessState && (!accessState.authorized || shouldShowNameForm));

  const isLive = session.connectionState === ConnectionState.Connected;
  const isBusy = session.connectionState === ConnectionState.Connecting || isStarting;
  const isMicBusy = isMicTransitioning;

  const displayedSubtitle = useMemo(() => {
    if (!accessState) {
      return "Preparing the presentation...";
    }

    if (shouldShowAccessForm) {
      return accessState.requiresPasscode
        ? "Enter your name and passcode to open the presentation."
        : "Enter your name to open the presentation.";
    }

    if (isMicOpen) {
      return "Tap again to send your question.";
    }

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
      return "";
    }

    if (hasEverConnected) {
      return "Tap the mic to reconnect.";
    }

    return "Tap the mic to begin the live walkthrough.";
  }, [accessState, botTtsTranscript, hasEverConnected, isBusy, isLive, isMicOpen, isUserSpeaking, shouldShowAccessForm, uiError, userTranscript]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccessState() {
      const response = await fetch("/api/access", { cache: "no-store" });
      const data = (await response.json()) as AccessState;
      if (!cancelled) {
        setAccessState(data);
      }
    }

    void loadAccessState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedName = window.localStorage.getItem(LISTENER_NAME_STORAGE_KEY)?.trim();
    if (storedName) {
      setListenerName(storedName);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const trimmedName = listenerName.trim();
    if (!trimmedName) {
      window.localStorage.removeItem(LISTENER_NAME_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(LISTENER_NAME_STORAGE_KEY, trimmedName);
  }, [listenerName]);

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
      setIsMicOpen(false);
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

  const callAgentRpc = useCallback(
    async (method: string, payload: Record<string, unknown> = {}) => {
      const agentIdentity = getAgentIdentity(room);
      if (!agentIdentity) {
        throw new Error("The live guide is not connected yet. Please wait a moment and try again.");
      }

      await room.localParticipant.performRpc({
        destinationIdentity: agentIdentity,
        method,
        payload: JSON.stringify(payload),
        responseTimeout: 5000,
      });
    },
    [room],
  );

  useEffect(() => {
    if (!isLive || isMicOpen) {
      return;
    }

    void room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
  }, [isLive, isMicOpen, room]);

  async function handleStart() {
    if (isBusy || !isAccessReady) {
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

  async function handleOpenMic() {
    const micCapabilityError = getMicCapabilityError();
    if (micCapabilityError) {
      setUiError(micCapabilityError);
      return;
    }

    setIsMicTransitioning(true);
    setUiError(null);
    setUserTranscript("");

    try {
      await callAgentRpc("beforest.prepare_user_turn", {
        source: "tap_to_speak",
      });
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMicOpen(true);
    } catch (error) {
      setIsMicOpen(false);
      setUiError(
        error instanceof Error
          ? error.message
          : "Microphone access failed. Check browser permissions and try again.",
      );
    } finally {
      setIsMicTransitioning(false);
    }
  }

  async function handleCloseMic() {
    setIsMicTransitioning(true);

    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      await callAgentRpc("beforest.commit_user_turn", {
        source: "tap_to_speak",
      });
    } catch (error) {
      setUiError(
        error instanceof Error
          ? error.message
          : "Could not close the microphone cleanly.",
      );
    } finally {
      setIsMicOpen(false);
      setIsMicTransitioning(false);
    }
  }

  async function handleAccessSubmit() {
    if (!listenerName.trim()) {
      setUiError("Please enter your name before you begin.");
      return;
    }

    if (accessState?.authorized) {
      setUiError(null);
      return;
    }

    if (!accessState?.requiresPasscode) {
      setUiError(null);
      setAccessState({ requiresPasscode: false, authorized: true });
      return;
    }

    setIsUnlocking(true);
    setUiError(null);

    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ passcode }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        authorized?: boolean;
        requiresPasscode?: boolean;
        error?: string;
      };

      if (!response.ok || !data.authorized) {
        throw new Error(data.error || "Unable to unlock the presentation.");
      }

      setAccessState({
        requiresPasscode: Boolean(data.requiresPasscode),
        authorized: true,
      });
      setPasscode("");
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Unable to unlock the presentation.");
    } finally {
      setIsUnlocking(false);
    }
  }

  function handlePrimaryAction() {
    if (!isLive) {
      void handleStart();
      return;
    }

    if (isBusy || isStarting || isMicBusy) {
      return;
    }

    if (isMicOpen) {
      void handleCloseMic();
      return;
    }

    void handleOpenMic();
  }

  const actionLabel = isBusy || isMicBusy
    ? "Connecting"
    : isLive
      ? isMicOpen
        ? "Tap again to send"
        : "Tap to speak"
      : "Begin live walkthrough";

  const showTrialCta = visual.id === "trial-stay";

  const micHint = isLive
    ? isMicOpen
      ? "Listening now. Tap again to send."
      : "Tap once to speak. Tap again to send."
    : isAccessReady
      ? "Tap to begin. Once connected, tap once to speak and tap again to send."
      : accessState?.requiresPasscode
        ? "Add your name and passcode to open the presentation."
        : "Add your name to open the presentation.";

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
                  isMicOpen ? "is-open" : "",
                  isBusy || isMicBusy ? "is-busy" : "",
                  isBotSpeaking ? "is-speaking" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={handlePrimaryAction}
                disabled={isBusy || isMicBusy}
                aria-label={actionLabel}
                aria-pressed={isLive ? isMicOpen : undefined}
              >
                <span className="beforest-mic-button__ring" aria-hidden="true" />
                <span className="beforest-mic-button__surface">
                  {isBusy || isMicBusy ? (
                    <LoaderCircle size={24} className="spin" />
                  ) : isLive && !isMicOpen ? (
                    <MicOff size={24} />
                  ) : (
                    <Mic size={24} />
                  )}
                </span>
              </button>

              <p className="beforest-mic-hint" aria-live="polite">
                {micHint}
              </p>

              {shouldShowAccessForm ? (
                <div className="beforest-access-card">
                  <input
                    className="beforest-access-input"
                    type="text"
                    value={listenerName}
                    onChange={(event) => setListenerName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                  {accessState?.requiresPasscode ? (
                    <input
                      className="beforest-access-input"
                      type="password"
                      value={passcode}
                      onChange={(event) => setPasscode(event.target.value)}
                      placeholder="Passcode"
                      autoComplete="one-time-code"
                    />
                  ) : null}
                  <button
                    type="button"
                    className="beforest-access-button"
                    onClick={handleAccessSubmit}
                    disabled={isUnlocking}
                  >
                    {isUnlocking ? "Opening..." : "Open presentation"}
                  </button>
                </div>
              ) : null}

              {showTrialCta ? (
                <div className="beforest-cta-card">
                  <p className="beforest-cta-eyebrow">The First Real Step</p>
                  <h2 className="beforest-cta-title">Start your trial stay at Blyton Bungalow.</h2>
                  <a
                    className="beforest-cta-button"
                    href="https://hospitality.beforest.co"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Start your trial
                  </a>
                </div>
              ) : null}
            </div>

            <div className="beforest-screen-frame" aria-hidden="true" />
          </div>
        </section>

        <RoomAudioRenderer />
      </main>
    </RoomContext.Provider>
  );
};
