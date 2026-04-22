"use client";

import {
  GoogleGenAI,
  Modality,
  type FunctionCall,
  type FunctionDeclaration,
  type FunctionResponse,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { LoaderCircle, Mic, MicOff } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_VISUAL } from "./beforest";
import {
  type BeforestVisual,
  type KnowledgeChunk,
  searchKnowledge,
  selectImage,
} from "@/lib/beforest-shared";
import {
  audioBlobFromMessage,
  bytesToBase64,
  mergeRollingWords,
  queueAudioChunk,
  type QueuedAudioChunk,
  takeLastWords,
} from "@/lib/gemini-live-utils";

interface ClientAppProps {
  isMobile: boolean;
}

type AccessState = {
  requiresPasscode: boolean;
  authorized: boolean;
};

type PresentationContext = {
  initialVisual: BeforestVisual;
  images: BeforestVisual[];
  knowledgeChunks: KnowledgeChunk[];
  openingPrompt: string;
};

type GeminiToken = {
  name: string;
};

const LISTENER_NAME_STORAGE_KEY = "beforest_listener_name";
const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

type RecorderState = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  gain: GainNode;
  chunks: Float32Array[];
  sampleRate: number;
};

function getMicCapabilityError() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.isSecureContext) {
    return "Microphone access needs a secure page. Open this app on localhost or HTTPS and try again.";
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser cannot open the microphone here. Try Chrome on an HTTPS URL.";
  }

  return null;
}

function mergeFloat32Chunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function float32ToPcm16(input: Float32Array) {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] || 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

export const ClientApp: React.FC<ClientAppProps> = ({ isMobile }) => {
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [listenerName, setListenerName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [presentationContext, setPresentationContext] = useState<PresentationContext | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isMicTransitioning, setIsMicTransitioning] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [didMissUserTurn, setDidMissUserTurn] = useState(false);
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [botTtsTranscript, setBotTtsTranscript] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [visual, setVisual] = useState<BeforestVisual>(INITIAL_VISUAL);
  const [uiError, setUiError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<RecorderState | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<QueuedAudioChunk[]>([]);
  const pendingBotTranscriptRef = useRef("");
  const imagesRef = useRef<BeforestVisual[]>([]);
  const knowledgeRef = useRef<KnowledgeChunk[]>([]);

  const isAccessReady = Boolean(accessState?.authorized && listenerName.trim());
  const shouldShowNameForm = Boolean(accessState && !listenerName.trim());
  const shouldShowAccessForm = Boolean(accessState && (!accessState.authorized || shouldShowNameForm));
  const isBusy = isStarting;
  const isMicBusy = isMicTransitioning;
  const isLive = isSessionReady;

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
      return isUserSpeaking
        ? takeLastWords(userTranscript.trim(), 3) || "Listening..."
        : "Listening. Speak, then tap again to send.";
    }
    if (isAwaitingReply) {
      return "Answering your question...";
    }
    if (isLive && !hasEverConnected) {
      return "Opening Gemini Live...";
    }
    if (didMissUserTurn) {
      return "No question captured. Tap once to speak, then tap again to send.";
    }
    if (isUserSpeaking) {
      return takeLastWords(userTranscript.trim(), 3) || "Listening...";
    }
    if (botTtsTranscript.trim()) {
      return takeLastWords(botTtsTranscript.trim(), 3);
    }
    if (uiError) {
      return uiError;
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
  }, [accessState, botTtsTranscript, didMissUserTurn, hasEverConnected, isAwaitingReply, isBusy, isLive, isMicOpen, isUserSpeaking, shouldShowAccessForm, uiError, userTranscript]);

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

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      for (const chunk of audioQueueRef.current) {
        URL.revokeObjectURL(chunk.url);
      }
      audioQueueRef.current = [];
      void sessionRef.current?.close?.();
      if (recorderRef.current) {
        recorderRef.current.stream.getTracks().forEach((track) => track.stop());
        void recorderRef.current.context.close();
      }
    };
  }, []);

  const playNextAudioChunk = useCallback(() => {
    const nextChunk = audioQueueRef.current.shift();
    if (!nextChunk) {
      setIsBotSpeaking(false);
      return;
    }

    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    setBotTtsTranscript(nextChunk.subtitle);
    audio.src = nextChunk.url;
    audio.onended = () => {
      URL.revokeObjectURL(nextChunk.url);
      playNextAudioChunk();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(nextChunk.url);
      playNextAudioChunk();
    };
    void audio.play().catch(() => {
      URL.revokeObjectURL(nextChunk.url);
      playNextAudioChunk();
    });
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    for (const chunk of audioQueueRef.current) {
      URL.revokeObjectURL(chunk.url);
    }
    audioQueueRef.current = [];
    setIsBotSpeaking(false);
  }, []);

  const runToolCalls = useCallback(async (functionCalls: FunctionCall[]) => {
    const responses: FunctionResponse[] = functionCalls.map((call) => {
      const name = call.name || "";
      if (name === "retrieve_beforest_knowledge") {
        const query = String(call.args?.query || "").trim();
        const topK = Number(call.args?.top_k || 3);
        const matches = searchKnowledge(knowledgeRef.current, query, topK);
        return {
          id: call.id || crypto.randomUUID(),
          name,
          response: {
            query,
            matches,
            guidance:
              "Use only these approved excerpts and the current conversation context. If the answer is still not grounded, say you do not have an approved answer yet.",
          },
        };
      }

      if (name === "show_curated_image") {
        const image = selectImage(
          imagesRef.current,
          String(call.args?.topic || ""),
          String(call.args?.mood || ""),
          String(call.args?.image_id || ""),
        );
        setVisual(image);
        return {
          id: call.id || crypto.randomUUID(),
          name,
          response: {
            selected: image,
            guidance:
              "The frontend visual has been updated. Continue naturally without mentioning the tool.",
          },
        };
      }

      return {
        id: call.id || crypto.randomUUID(),
        name: name || "unknown",
        response: {
          error: "Unknown tool requested.",
        },
      };
    });

    sessionRef.current?.sendToolResponse({ functionResponses: responses });
  }, []);

  const handleLiveMessage = useCallback(async (message: LiveServerMessage) => {
    if (message.toolCall?.functionCalls?.length) {
      await runToolCalls(message.toolCall.functionCalls);
      return;
    }

    if (message.serverContent?.inputTranscription?.text) {
      const text = message.serverContent.inputTranscription.text.trim();
      if (text) {
        setUserTranscript(text);
        setDidMissUserTurn(false);
      }
    }

    if (message.serverContent?.outputTranscription?.text) {
      const text = message.serverContent.outputTranscription.text.trim();
      if (text) {
        setIsAwaitingReply(false);
        pendingBotTranscriptRef.current = mergeRollingWords(pendingBotTranscriptRef.current, text, 3);
      }
    }

    if (message.serverContent?.interrupted) {
      stopPlayback();
    }

    const audioBlob = audioBlobFromMessage(message);
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      queueAudioChunk(audioQueueRef.current, url, pendingBotTranscriptRef.current);
      setIsBotSpeaking(true);
      if (!audioRef.current || audioRef.current.paused) {
        playNextAudioChunk();
      }
    }

    if (message.serverContent?.turnComplete || message.serverContent?.generationComplete) {
      setIsAwaitingReply(false);
    }
  }, [playNextAudioChunk, runToolCalls, stopPlayback]);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok || !data.authorized) {
        throw new Error(String(data.error || "Unable to unlock the presentation."));
      }
      setAccessState({ requiresPasscode: Boolean(data.requiresPasscode), authorized: true });
      setPasscode("");
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Unable to unlock the presentation.");
    } finally {
      setIsUnlocking(false);
    }
  }

  async function ensurePresentationContext() {
    if (presentationContext) {
      return presentationContext;
    }
    const response = await fetch("/api/presentation-context", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load presentation context.");
    }
    const data = (await response.json()) as PresentationContext;
    setPresentationContext(data);
    setVisual(data.initialVisual);
    imagesRef.current = data.images;
    knowledgeRef.current = data.knowledgeChunks;
    return data;
  }

  async function handleStart() {
    if (isBusy || !isAccessReady || isSessionReady) {
      return;
    }

    setIsStarting(true);
    setUiError(null);
    setBotTtsTranscript("");
    pendingBotTranscriptRef.current = "";
    setUserTranscript("");
    setDidMissUserTurn(false);
    setIsAwaitingReply(false);

    try {
      const context = await ensurePresentationContext();
      const tokenResponse = await fetch("/api/gemini-live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listenerName }),
      });
      if (!tokenResponse.ok) {
        throw new Error(await tokenResponse.text());
      }
      const token = (await tokenResponse.json()) as GeminiToken;
      const ai = new GoogleGenAI({ apiKey: token.name, apiVersion: "v1alpha" });

      const toolDeclarations: FunctionDeclaration[] = [
        {
          name: "retrieve_beforest_knowledge",
          description:
            "Search approved Beforest knowledge for product facts, collectives, pricing framing, structure details, trial-stay information, and brand constraints.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              top_k: { type: "integer" },
            },
            required: ["query"],
          },
        },
        {
          name: "show_curated_image",
          description:
            "Select an approved Beforest image for the current topic and update the frontend visual state.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              topic: { type: "string" },
              mood: { type: "string" },
              image_id: { type: "string" },
            },
            required: ["topic"],
          },
        },
      ];

      const liveSession = await ai.live.connect({
        model: MODEL,
        callbacks: {
          onopen: () => {
            setIsSessionReady(true);
            setHasEverConnected(true);
            setIsStarting(false);
            setUiError(null);
          },
          onmessage: (message: LiveServerMessage) => {
            void handleLiveMessage(message);
          },
          onerror: (event: ErrorEvent) => {
            setUiError(event.message || "Gemini Live connection failed.");
            setIsStarting(false);
          },
          onclose: () => {
            setIsSessionReady(false);
            setIsMicOpen(false);
            setIsAwaitingReply(false);
            stopPlayback();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: process.env.NEXT_PUBLIC_GOOGLE_VOICE_ID || "Puck",
              },
            },
          },
          tools: [{ functionDeclarations: toolDeclarations }],
        },
      });

      sessionRef.current = liveSession;
      liveSession.sendClientContent({
        turns: [{ role: "user", parts: [{ text: context.openingPrompt }] }],
        turnComplete: true,
      });
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Unable to begin the live walkthrough.");
      setIsStarting(false);
    }
  }

  async function handleOpenMic() {
    const micCapabilityError = getMicCapabilityError();
    if (micCapabilityError) {
      setUiError(micCapabilityError);
      return;
    }
    if (!sessionRef.current || !isSessionReady) {
      setUiError("Gemini Live is still joining. Please wait a moment and try again.");
      return;
    }

    setIsMicTransitioning(true);
    setUiError(null);
    setUserTranscript("");
    setDidMissUserTurn(false);
    setIsAwaitingReply(false);
    stopPlayback();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext({ sampleRate: 16000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const gain = context.createGain();
      gain.gain.value = 0;

      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        setIsUserSpeaking(true);
      };

      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);

      recorderRef.current = {
        stream,
        context,
        source,
        processor,
        gain,
        chunks,
        sampleRate: context.sampleRate,
      };

      sessionRef.current.sendRealtimeInput({ activityStart: {} });
      setIsMicOpen(true);
    } catch (error) {
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
    setDidMissUserTurn(false);
    setIsAwaitingReply(true);
    setIsUserSpeaking(false);

    try {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (!recorder) {
        setDidMissUserTurn(true);
        setIsAwaitingReply(false);
        return;
      }

      recorder.processor.disconnect();
      recorder.source.disconnect();
      recorder.gain.disconnect();
      recorder.stream.getTracks().forEach((track) => track.stop());
      await recorder.context.close();

      const merged = mergeFloat32Chunks(recorder.chunks);
      if (!merged.length) {
        setDidMissUserTurn(true);
        setIsAwaitingReply(false);
        sessionRef.current?.sendRealtimeInput({ activityEnd: {} });
        return;
      }

      const pcm16 = float32ToPcm16(merged);
      sessionRef.current?.sendRealtimeInput({
        audio: {
          data: bytesToBase64(new Uint8Array(pcm16.buffer)),
          mimeType: "audio/pcm",
        },
      });
      sessionRef.current?.sendRealtimeInput({ activityEnd: {} });
    } catch (error) {
      setIsAwaitingReply(false);
      setUiError(error instanceof Error ? error.message : "Could not send your question.");
    } finally {
      setIsMicOpen(false);
      setIsMicTransitioning(false);
    }
  }

  function handlePrimaryAction() {
    if (!isLive) {
      void handleStart();
      return;
    }
    if (isBusy || isMicBusy) {
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
      : isAwaitingReply
        ? "Sending your question to Gemini."
        : "Tap once to speak. Tap again to send."
    : isAccessReady
      ? "Tap to begin. Once connected, tap once to speak and tap again to send."
      : accessState?.requiresPasscode
        ? "Add your name and passcode to open the presentation."
        : "Add your name to open the presentation.";

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
    </main>
  );
};
