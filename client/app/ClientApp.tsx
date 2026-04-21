"use client";

import {
  RTVIEvent,
  type BotLLMTextData,
  type BotTTSTextData,
  type TranscriptData,
} from "@pipecat-ai/client-js";
import {
  usePipecatClientMicControl,
  usePipecatClientTransportState,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react";
import { LoaderCircle, Mic, MicOff } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { INITIAL_VISUAL, type BeforestVisual } from "./beforest";

interface ClientAppProps {
  connect?: () => void | Promise<void>;
  disconnect?: () => void | Promise<void>;
  isMobile: boolean;
  error?: string | null;
}

type ServerVisualMessage = {
  type?: string;
  visual?: BeforestVisual;
};

function readBotText(payload: BotLLMTextData | string | undefined) {
  if (!payload) {
    return "";
  }

  if (typeof payload === "string") {
    return payload;
  }

  return payload.text ?? "";
}

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

export const ClientApp: React.FC<ClientAppProps> = ({ connect, isMobile, error }) => {
  const transportState = usePipecatClientTransportState();
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();

  const [isStarting, setIsStarting] = useState(false);
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isPressingMic, setIsPressingMic] = useState(false);
  const [, setBotTranscript] = useState("");
  const [botTtsTranscript, setBotTtsTranscript] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [visual, setVisual] = useState<BeforestVisual>(INITIAL_VISUAL);
  const [uiError, setUiError] = useState<string | null>(null);

  const isLive = ["connected", "ready"].includes(transportState);
  const isBusy = ["initializing", "authenticating", "connecting"].includes(transportState);

  const displayedSubtitle = useMemo(() => {
    if (isUserSpeaking) {
      return takeLastWords(userTranscript.trim(), 3) || "Listening...";
    }

    if (botTtsTranscript.trim()) {
      return takeLastWords(botTtsTranscript.trim(), 3);
    }

    if (uiError || error) {
      return "Connection failed. Tap the mic to try again.";
    }

    if (isBusy || isStarting) {
      return "Connecting to Gemini Live...";
    }

    if (isLive) {
      return visual.note;
    }

    if (hasEverConnected) {
      return "Tap the mic to reconnect.";
    }

    return "Tap the mic to begin the live walkthrough.";
  }, [
    botTtsTranscript,
    error,
    hasEverConnected,
    isBusy,
    isLive,
    isStarting,
    isUserSpeaking,
    uiError,
    userTranscript,
    visual.note,
  ]);

  useEffect(() => {
    if (isLive) {
      setHasEverConnected(true);
      setIsStarting(false);
      setUiError(null);
    }
  }, [isLive]);

  useEffect(() => {
    if (!isLive || isPressingMic) {
      return;
    }

    enableMic(false);
  }, [enableMic, isLive, isPressingMic]);

  useRTVIClientEvent(
    RTVIEvent.BotReady,
    useCallback(() => {
      setIsStarting(false);
      setUiError(null);
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.BotStartedSpeaking,
    useCallback(() => {
      setIsBotSpeaking(true);
      setIsUserSpeaking(false);
      setBotTranscript("");
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.BotStoppedSpeaking,
    useCallback(() => {
      setIsBotSpeaking(false);
      setBotTranscript("");
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.UserStartedSpeaking,
    useCallback(() => {
      setIsUserSpeaking(true);
      setIsBotSpeaking(false);
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.UserStoppedSpeaking,
    useCallback(() => {
      setIsUserSpeaking(false);
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.UserTranscript,
    useCallback((payload: TranscriptData) => {
      if (!payload?.text) {
        return;
      }

      setUserTranscript(payload.text);
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.BotTranscript,
    useCallback((payload: BotLLMTextData | string) => {
      const text = readBotText(payload);
      if (!text) {
        return;
      }

      setBotTranscript(text);
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.BotTtsStarted,
    useCallback(() => {
      setBotTtsTranscript("");
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.BotTtsText,
    useCallback((payload: BotTTSTextData) => {
      const text = payload?.text?.trim();
      if (!text) {
        return;
      }

      setBotTtsTranscript((previous) => mergeRollingWords(previous, payload.text, 3));
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.ServerMessage,
    useCallback((payload: unknown) => {
      const message = payload as ServerVisualMessage;
      if (message?.type === "beforest.visual" && message.visual?.imageUrl) {
        setVisual(message.visual);
      }
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.Error,
    useCallback((payload: unknown) => {
      const nextError =
        typeof payload === "object" && payload !== null && "data" in payload
          ? String((payload as { data?: { message?: string } }).data?.message ?? "")
          : "Unable to connect right now.";
      setUiError(nextError || "Unable to connect right now.");
      setIsStarting(false);
    }, []),
  );

  async function handleStart() {
    if (isBusy) {
      return;
    }

    setIsStarting(true);
    setUiError(null);
    setBotTranscript("");
    setBotTtsTranscript("");
    setUserTranscript("");

    try {
      await connect?.();
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
    enableMic(true);
  }

  function handleMicPointerUp() {
    setIsPressingMic(false);

    if (!isLive) {
      return;
    }

    enableMic(false);
  }

  const actionLabel = isBusy || isStarting
    ? "Connecting"
    : isLive
      ? "Hold to talk, release to send"
      : "Begin live walkthrough";

  return (
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
            {uiError || error ? (
              <p className="beforest-inline-error" role="alert">
                {uiError || error}
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
                isMicEnabled ? "is-open" : "",
                isBusy || isStarting ? "is-busy" : "",
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
              aria-pressed={isLive ? isMicEnabled : undefined}
            >
              <span className="beforest-mic-button__ring" aria-hidden="true" />
              <span className="beforest-mic-button__surface">
                {isBusy || isStarting ? (
                  <LoaderCircle size={24} className="spin" />
                ) : isLive && !isMicEnabled ? (
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
    </main>
  );
};
