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
import { LoaderCircle, Mic, Send } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_VISUAL } from "./beforest";
import {
  buildSectionTurnPrompt,
  FIRST_SECTION_ID,
  getNextSectionId,
  getPresentationSection,
  type PresentationSectionId,
} from "./presentationAgenda";
import {
  type BeforestVisual,
  type KnowledgeChunk,
  searchKnowledge,
  selectImage,
} from "@/lib/beforest-shared";
import {
  bytesToBase64,
  extractAudioPayloadFromMessage,
  mergeRollingWords,
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
const DEFAULT_VOICE_ID = "Gacrux";
const FOUNDING_SILENCE_URL = "https://10percent.beforest.co/the-founding-silence";
const TRIAL_STAY_URL = "https://hospitality.beforest.co";

type PromptModal = {
  id: string;
  question: string;
  context: string;
  suggestedAnswers: string[];
};

type RecorderState = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  gain: GainNode;
  sampleRate: number;
  hasSpeech: boolean;
  silenceTimerId: number | null;
  noSpeechTimerId: number | null;
};

type AmbientBedState = {
  gain: GainNode;
  noiseSource: AudioBufferSourceNode;
  chirpTimerIds: number[];
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

function float32ToPcm16(input: Float32Array) {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] || 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function createRainNoiseBuffer(context: AudioContext) {
  const durationSeconds = 2;
  const buffer = context.createBuffer(1, context.sampleRate * durationSeconds, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let previous = 0;

  for (let index = 0; index < channel.length; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.86 + white * 0.14;
    channel[index] = previous * 0.34;
  }

  return buffer;
}

export const ClientApp: React.FC<ClientAppProps> = ({ isMobile }) => {
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [listenerName, setListenerName] = useState("");
  const [hasConfirmedListener, setHasConfirmedListener] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [presentationContext, setPresentationContext] = useState<PresentationContext | null>(null);
  const [geminiToken, setGeminiToken] = useState<GeminiToken | null>(null);
  const [isPreloading, setIsPreloading] = useState(false);
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
  const [promptModal, setPromptModal] = useState<PromptModal | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState<PresentationSectionId>(FIRST_SECTION_ID);
  const [completedSections, setCompletedSections] = useState<PresentationSectionId[]>([]);
  const [fallbackModalSections, setFallbackModalSections] = useState<PresentationSectionId[]>([]);
  const [uiError, setUiError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<RecorderState | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambientBedRef = useRef<AmbientBedState | null>(null);
  const activeSourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const subtitleTimerIdsRef = useRef<number[]>([]);
  const nextPlaybackTimeRef = useRef(0);
  const pendingBotTranscriptRef = useRef("");
  const imagesRef = useRef<BeforestVisual[]>([]);
  const knowledgeRef = useRef<KnowledgeChunk[]>([]);
  const currentSectionIdRef = useRef<PresentationSectionId>(FIRST_SECTION_ID);
  const completedSectionsRef = useRef<PresentationSectionId[]>([]);
  const isAdvancingSectionRef = useRef(false);

  const isAccessReady = Boolean(accessState?.authorized && listenerName.trim() && hasConfirmedListener);
  const shouldShowNameForm = Boolean(accessState && !hasConfirmedListener);
  const shouldShowAccessForm = Boolean(accessState && (!accessState.authorized || shouldShowNameForm));
  const isBusy = isStarting;
  const isMicBusy = isMicTransitioning;
  const isLive = isSessionReady;
  const canUsePrimaryAction = isAccessReady && !isBusy && !isMicBusy;
  const isGuidePrepared = Boolean(presentationContext && geminiToken);

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
        ? takeLastWords(userTranscript.trim(), 10) || "Listening..."
        : "Ask your question. I will send it when you pause.";
    }
    if (isAwaitingReply) {
      return "Answering your question...";
    }
    if (isLive && !hasEverConnected) {
      return "Opening Gemini Live...";
    }
    if (didMissUserTurn) {
      return "No voice detected. Tap ask when you are ready.";
    }
    if (isUserSpeaking) {
      return takeLastWords(userTranscript.trim(), 10) || "Listening...";
    }
    if (botTtsTranscript.trim()) {
      return takeLastWords(botTtsTranscript.trim(), 12);
    }
    if (uiError) {
      return uiError;
    }
    if (isBusy) {
      return "Connecting to Gemini Live...";
    }
    if (isAccessReady && isPreloading) {
      return "Preparing the live guide...";
    }
    if (isAccessReady && isGuidePrepared) {
      return "Ready. Start when you want the guide to begin.";
    }
    if (isLive) {
      return "";
    }
    if (hasEverConnected) {
      return "Tap the mic to reconnect.";
    }
    return "Begin the guided walkthrough when you are ready.";
  }, [accessState, botTtsTranscript, didMissUserTurn, hasEverConnected, isAccessReady, isAwaitingReply, isBusy, isGuidePrepared, isLive, isMicOpen, isPreloading, isUserSpeaking, shouldShowAccessForm, uiError, userTranscript]);

  const guideStage = useMemo(() => getPresentationSection(currentSectionId).stageLabel, [currentSectionId]);

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
      setHasConfirmedListener(true);
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
    currentSectionIdRef.current = currentSectionId;
  }, [currentSectionId]);

  useEffect(() => {
    completedSectionsRef.current = completedSections;
  }, [completedSections]);

  useEffect(() => {
    const sourceNodes = activeSourceNodesRef.current;

    return () => {
      for (const timerId of subtitleTimerIdsRef.current) {
        window.clearTimeout(timerId);
      }
      void sessionRef.current?.close?.();
      sourceNodes.forEach((source) => {
        try {
          source.stop();
        } catch {
          // noop
        }
      });
      sourceNodes.clear();
      if (ambientBedRef.current) {
        ambientBedRef.current.chirpTimerIds.forEach((timerId) => window.clearTimeout(timerId));
        try {
          ambientBedRef.current.noiseSource.stop();
        } catch {
          // noop
        }
        ambientBedRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
      if (recorderRef.current) {
        if (recorderRef.current.silenceTimerId) {
          window.clearTimeout(recorderRef.current.silenceTimerId);
        }
        if (recorderRef.current.noSpeechTimerId) {
          window.clearTimeout(recorderRef.current.noSpeechTimerId);
        }
        recorderRef.current.stream.getTracks().forEach((track) => track.stop());
        void recorderRef.current.context.close();
      }
    };
  }, []);

  const ensureOutputAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlaybackTimeRef.current = audioContextRef.current.currentTime;
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    subtitleTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
    subtitleTimerIdsRef.current = [];

    activeSourceNodesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // noop
      }
    });
    activeSourceNodesRef.current.clear();

    if (audioContextRef.current) {
      nextPlaybackTimeRef.current = audioContextRef.current.currentTime;
    }

    setIsBotSpeaking(false);
  }, []);

  const stopAmbientBed = useCallback(() => {
    const ambientBed = ambientBedRef.current;
    ambientBedRef.current = null;
    if (!ambientBed) {
      return;
    }

    ambientBed.chirpTimerIds.forEach((timerId) => window.clearTimeout(timerId));
    try {
      ambientBed.noiseSource.stop();
    } catch {
      // noop
    }
    ambientBed.gain.disconnect();
  }, []);

  const startAmbientBed = useCallback((context: AudioContext) => {
    if (ambientBedRef.current) {
      return;
    }

    const gain = context.createGain();
    gain.gain.value = 0.08;
    gain.connect(context.destination);

    const rainFilter = context.createBiquadFilter();
    rainFilter.type = "lowpass";
    rainFilter.frequency.value = 1500;
    rainFilter.Q.value = 0.55;

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = createRainNoiseBuffer(context);
    noiseSource.loop = true;
    noiseSource.connect(rainFilter);
    rainFilter.connect(gain);
    noiseSource.start();

    const chirpTimerIds: number[] = [];
    const scheduleChirp = () => {
      const timerId = window.setTimeout(() => {
        if (!ambientBedRef.current || context.state === "closed") {
          return;
        }

        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const chirpGain = context.createGain();
        const startFrequency = 1800 + Math.random() * 900;
        const endFrequency = startFrequency + 700 + Math.random() * 900;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(startFrequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.18);

        chirpGain.gain.setValueAtTime(0.0001, now);
        chirpGain.gain.exponentialRampToValueAtTime(0.028, now + 0.04);
        chirpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

        oscillator.connect(chirpGain);
        chirpGain.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + 0.28);

        oscillator.onended = () => {
          oscillator.disconnect();
          chirpGain.disconnect();
        };

        scheduleChirp();
      }, 3600 + Math.random() * 6200);
      chirpTimerIds.push(timerId);
    };

    ambientBedRef.current = { gain, noiseSource, chirpTimerIds };
    scheduleChirp();
  }, []);

  useEffect(() => {
    const ambientBed = ambientBedRef.current;
    const context = audioContextRef.current;
    if (!ambientBed || !context || context.state === "closed") {
      return;
    }

    ambientBed.gain.gain.setTargetAtTime(isBotSpeaking ? 0.045 : 0.095, context.currentTime, 0.8);
  }, [isBotSpeaking]);

  const showPromptModal = useCallback((modal: PromptModal) => {
    stopPlayback();
    setIsAwaitingReply(false);
    setBotTtsTranscript("");
    pendingBotTranscriptRef.current = "";
    setPromptModal(modal);
  }, [stopPlayback]);

  const setSectionVisual = useCallback((sectionId: PresentationSectionId) => {
    const section = getPresentationSection(sectionId);
    const sectionVisual = imagesRef.current.find((image) => image.id === section.visualId);
    if (sectionVisual) {
      setVisual(sectionVisual);
    }
  }, []);

  const markSectionCompleted = useCallback((sectionId: PresentationSectionId) => {
    setCompletedSections((previous) => {
      if (previous.includes(sectionId)) {
        return previous;
      }
      const next = [...previous, sectionId];
      completedSectionsRef.current = next;
      return next;
    });
  }, []);

  const sendPresenterSection = useCallback((
    sectionId: PresentationSectionId,
    listenerChoice?: string,
    session: Session | null = sessionRef.current,
  ) => {
    if (!session) {
      return;
    }

    const section = getPresentationSection(sectionId);
    currentSectionIdRef.current = sectionId;
    setCurrentSectionId(sectionId);
    setSectionVisual(sectionId);
    stopPlayback();
    setPromptModal(null);
    setUiError(null);
    setBotTtsTranscript("");
    pendingBotTranscriptRef.current = "";
    setIsAwaitingReply(true);

    session.sendClientContent({
      turns: [{
        role: "user",
        parts: [{
          text: buildSectionTurnPrompt({
            section,
            listenerChoice,
            completedSections: completedSectionsRef.current,
          }),
        }],
      }],
      turnComplete: true,
    });
  }, [setSectionVisual, stopPlayback]);

  const advanceToNextSection = useCallback((listenerChoice?: string) => {
    const currentSection = getPresentationSection(currentSectionIdRef.current);
    const nextSectionId = getNextSectionId(currentSection.id);
    if (!nextSectionId) {
      return;
    }

    markSectionCompleted(currentSection.id);
    sendPresenterSection(nextSectionId, listenerChoice);
  }, [markSectionCompleted, sendPresenterSection]);

  const createPcmAudioBuffer = useCallback(
    (context: AudioContext, bytes: Uint8Array, sampleRate: number) => {
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        channel[index] = samples[index] / 0x8000;
      }
      return buffer;
    },
    [],
  );

  const scheduleAudioPlayback = useCallback(
    async (message: LiveServerMessage, subtitle: string) => {
      const payload = extractAudioPayloadFromMessage(message);
      if (!payload) {
        return;
      }

      const context = await ensureOutputAudioContext();
      let audioBuffer: AudioBuffer;

      if (payload.mimeType.toLowerCase().startsWith("audio/pcm") || payload.mimeType.toLowerCase().startsWith("audio/l16")) {
        audioBuffer = createPcmAudioBuffer(context, payload.bytes, payload.sampleRate);
      } else {
        const arrayBuffer = payload.bytes.buffer.slice(
          payload.bytes.byteOffset,
          payload.bytes.byteOffset + payload.bytes.byteLength,
        ) as ArrayBuffer;
        audioBuffer = await context.decodeAudioData(arrayBuffer);
      }

      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);

      const startAt = Math.max(context.currentTime + 0.02, nextPlaybackTimeRef.current);
      nextPlaybackTimeRef.current = startAt + audioBuffer.duration;

      const subtitleDelay = Math.max(0, (startAt - context.currentTime) * 1000);
      const timerId = window.setTimeout(() => {
        setBotTtsTranscript(subtitle);
      }, subtitleDelay);
      subtitleTimerIdsRef.current.push(timerId);

      source.onended = () => {
        activeSourceNodesRef.current.delete(source);
        if (!activeSourceNodesRef.current.size) {
          setIsBotSpeaking(false);
        }
      };

      activeSourceNodesRef.current.add(source);
      setIsBotSpeaking(true);
      source.start(startAt);
    },
    [createPcmAudioBuffer, ensureOutputAudioContext],
  );

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

      if (name === "ask_listener_question") {
        const responseId = call.id || crypto.randomUUID();
        const question = String(call.args?.question || "").trim();
        const context = String(call.args?.context || "").trim();
        const suggestedAnswers = Array.isArray(call.args?.suggested_answers)
          ? call.args.suggested_answers
              .map((answer) => String(answer || "").trim())
              .filter(Boolean)
              .slice(0, 4)
          : [];

        if (question && suggestedAnswers.length >= 2) {
          showPromptModal({
            id: responseId,
            question,
            context,
            suggestedAnswers,
          });
        }

        return {
          id: responseId,
          name,
          response: {
            shown: Boolean(question && suggestedAnswers.length >= 2),
            guidance:
              "The listener is seeing one option-only question. Stop speaking until they choose an option.",
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
  }, [showPromptModal]);

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
        pendingBotTranscriptRef.current = mergeRollingWords(pendingBotTranscriptRef.current, text, 12);
      }
    }

    if (message.serverContent?.interrupted) {
      stopPlayback();
    }

    const subtitleSnapshot = pendingBotTranscriptRef.current;
    if (extractAudioPayloadFromMessage(message)) {
      await scheduleAudioPlayback(message, subtitleSnapshot);
    }

    if (message.serverContent?.turnComplete || message.serverContent?.generationComplete) {
      setIsAwaitingReply(false);
      const currentSection = getPresentationSection(currentSectionIdRef.current);
      if (!currentSection.modalGoal && currentSection.nextSection && !isAdvancingSectionRef.current) {
        isAdvancingSectionRef.current = true;
        window.setTimeout(() => {
          isAdvancingSectionRef.current = false;
          if (!promptModal && !recorderRef.current) {
            advanceToNextSection();
          }
        }, 900);
      }
    }
  }, [advanceToNextSection, promptModal, runToolCalls, scheduleAudioPlayback, stopPlayback]);

  async function handleAccessSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!listenerName.trim()) {
      setUiError("Please enter your name before you begin.");
      return;
    }
    if (accessState?.authorized) {
      setHasConfirmedListener(true);
      setGeminiToken(null);
      setUiError(null);
      return;
    }
    if (!accessState?.requiresPasscode) {
      setUiError(null);
      setAccessState({ requiresPasscode: false, authorized: true });
      setHasConfirmedListener(true);
      setGeminiToken(null);
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
      setHasConfirmedListener(true);
      setGeminiToken(null);
      setPasscode("");
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Unable to unlock the presentation.");
    } finally {
      setIsUnlocking(false);
    }
  }

  const ensurePresentationContext = useCallback(async () => {
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
  }, [presentationContext]);

  const ensureGeminiToken = useCallback(async () => {
    if (geminiToken) {
      return geminiToken;
    }

    const tokenResponse = await fetch("/api/gemini-live-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listenerName }),
    });
    if (!tokenResponse.ok) {
      throw new Error(await tokenResponse.text());
    }
    const token = (await tokenResponse.json()) as GeminiToken;
    setGeminiToken(token);
    return token;
  }, [geminiToken, listenerName]);

  useEffect(() => {
    if (!isAccessReady || presentationContext || isSessionReady) {
      return;
    }

    let cancelled = false;
    async function preloadPresentation() {
      setIsPreloading(true);
      try {
        await ensurePresentationContext();
      } catch (error) {
        if (!cancelled) {
          setUiError(error instanceof Error ? error.message : "Unable to prepare the presentation.");
        }
      } finally {
        if (!cancelled) {
          setIsPreloading(false);
        }
      }
    }

    void preloadPresentation();
    return () => {
      cancelled = true;
    };
  }, [ensurePresentationContext, isAccessReady, isSessionReady, presentationContext]);

  useEffect(() => {
    if (!isAccessReady || geminiToken || isSessionReady) {
      return;
    }

    let cancelled = false;
    async function preloadToken() {
      setIsPreloading(true);
      try {
        await ensureGeminiToken();
      } catch (error) {
        if (!cancelled) {
          setUiError(error instanceof Error ? error.message : "Unable to prepare Gemini Live.");
        }
      } finally {
        if (!cancelled) {
          setIsPreloading(false);
        }
      }
    }

    void preloadToken();
    return () => {
      cancelled = true;
    };
  }, [ensureGeminiToken, geminiToken, isAccessReady, isSessionReady]);

  async function handleStart() {
    if (isBusy || !isAccessReady || isSessionReady) {
      if (!isAccessReady) {
        setUiError("Add your name first so the guide can open the walkthrough properly.");
      }
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
      const outputContext = await ensureOutputAudioContext();
      startAmbientBed(outputContext);
      await ensurePresentationContext();
      const token = await ensureGeminiToken();
      setCompletedSections([]);
      completedSectionsRef.current = [];
      setFallbackModalSections([]);
      currentSectionIdRef.current = FIRST_SECTION_ID;
      setCurrentSectionId(FIRST_SECTION_ID);
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
            "Select an approved Beforest visual for the current topic and update the frontend video/image state.",
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
        {
          name: "ask_listener_question",
          description:
            "Show one calm modal question to understand the listener's readiness, objections, or preferred next step. Use sparingly between agenda sections.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              question: { type: "string" },
              context: { type: "string" },
              suggested_answers: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                items: { type: "string" },
              },
            },
            required: ["question", "suggested_answers"],
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
            stopAmbientBed();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: process.env.NEXT_PUBLIC_GOOGLE_VOICE_ID || DEFAULT_VOICE_ID,
              },
            },
          },
          tools: [{ functionDeclarations: toolDeclarations }],
        },
      });

      sessionRef.current = liveSession;
      sendPresenterSection(FIRST_SECTION_ID, undefined, liveSession);
    } catch (error) {
      stopAmbientBed();
      setUiError(error instanceof Error ? error.message : "Unable to begin the live walkthrough.");
      setIsStarting(false);
    }
  }

  useEffect(() => {
    const section = getPresentationSection(currentSectionId);
    const modalGoal = section.modalGoal;
    if (
      !isSessionReady ||
      !modalGoal ||
      fallbackModalSections.includes(currentSectionId) ||
      promptModal ||
      isMicOpen ||
      isAwaitingReply
    ) {
      return;
    }

    const timerId = window.setTimeout(() => {
      const fallbackOptions = section.id === "access_model"
        ? [
            "Access without ownership",
            "I need a serious reset",
            "I want to understand 30 nights",
            "Blyton trial stay first",
          ]
        : section.id === "proof_limited"
          ? [
              "The place has to feel real",
              "Family use matters most",
              "30 nights must be practical",
              "Trying Blyton first",
            ]
          : [
              "Take the trial stay",
              "Receive more updates",
              "Understand membership",
              "Not right now",
            ];

      showPromptModal({
        id: `fallback-${section.id}`,
        question: section.id === "trial_stay_close"
          ? "What feels like the right next step?"
          : "What should I focus on next?",
        context: modalGoal,
        suggestedAnswers: fallbackOptions,
      });
      setFallbackModalSections((previous) => previous.includes(section.id) ? previous : [...previous, section.id]);
    }, 26000);

    return () => window.clearTimeout(timerId);
  }, [
    currentSectionId,
    fallbackModalSections,
    isAwaitingReply,
    isMicOpen,
    isSessionReady,
    promptModal,
    showPromptModal,
  ]);

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

      recorderRef.current = {
        stream,
        context,
        source,
        processor,
        gain,
        sampleRate: context.sampleRate,
        hasSpeech: false,
        silenceTimerId: null,
        noSpeechTimerId: window.setTimeout(() => {
          if (!recorderRef.current?.hasSpeech) {
            void handleCloseMic("silent");
          }
        }, 6500),
      };

      processor.onaudioprocess = (event) => {
        const recorder = recorderRef.current;
        if (!recorder) {
          return;
        }
        const input = new Float32Array(event.inputBuffer.getChannelData(0));
        let energy = 0;
        for (const sample of input) {
          energy += sample * sample;
        }
        const isSpeaking = Math.sqrt(energy / input.length) > 0.015;
        if (isSpeaking) {
          recorder.hasSpeech = true;
          if (recorder.noSpeechTimerId) {
            window.clearTimeout(recorder.noSpeechTimerId);
            recorder.noSpeechTimerId = null;
          }
          if (recorder.silenceTimerId) {
            window.clearTimeout(recorder.silenceTimerId);
            recorder.silenceTimerId = null;
          }
        } else if (recorder.hasSpeech && !recorder.silenceTimerId) {
          recorder.silenceTimerId = window.setTimeout(() => {
            void handleCloseMic("auto");
          }, 950);
        }
        setIsUserSpeaking(isSpeaking);

        const pcm16 = float32ToPcm16(input);
        sessionRef.current?.sendRealtimeInput({
          audio: {
            data: bytesToBase64(new Uint8Array(pcm16.buffer)),
            mimeType: `audio/pcm;rate=${context.sampleRate}`,
          },
        });
      };

      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);

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

  async function handleCloseMic(reason: "manual" | "auto" | "silent" = "manual") {
    setIsMicTransitioning(true);
    setDidMissUserTurn(false);
    setIsAwaitingReply(reason !== "silent");
    setIsUserSpeaking(false);

    try {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (!recorder) {
        setDidMissUserTurn(true);
        setIsAwaitingReply(false);
        return;
      }

      if (recorder.silenceTimerId) {
        window.clearTimeout(recorder.silenceTimerId);
      }
      if (recorder.noSpeechTimerId) {
        window.clearTimeout(recorder.noSpeechTimerId);
      }
      recorder.processor.disconnect();
      recorder.source.disconnect();
      recorder.gain.disconnect();
      recorder.stream.getTracks().forEach((track) => track.stop());
      await recorder.context.close();

      if (!recorder.hasSpeech) {
        setDidMissUserTurn(true);
        setIsAwaitingReply(false);
        sessionRef.current?.sendRealtimeInput({ activityEnd: {} });
        return;
      }

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
      void handleCloseMic("manual");
      return;
    }
    void handleOpenMic();
  }

  function handlePromptSubmit(answer: string) {
    const trimmedAnswer = answer.trim();
    if (!promptModal || !trimmedAnswer || isMicOpen || isAwaitingReply) {
      return;
    }

    const question = promptModal.question;
    setPromptModal(null);
    const currentSection = getPresentationSection(currentSectionIdRef.current);
    const nextSectionId = getNextSectionId(currentSection.id) || currentSection.id;
    markSectionCompleted(currentSection.id);
    sendPresenterSection(
      nextSectionId,
      `Question asked by the guide: ${question}\nListener selected: ${trimmedAnswer}`,
    );
  }

  const actionLabel = isBusy || isMicBusy
    ? "Connecting"
    : isLive
      ? isMicOpen
        ? "Listening"
        : "Ask a question"
      : "Begin live walkthrough";

  const showDecisionCta = visual.id === "trial-stay" || visual.id === "art-of-return-hero";
  const micHint = isLive
    ? isMicOpen
      ? "Listening now. Pause when finished; I will send it automatically."
      : isAwaitingReply
        ? "Sending your question to Gemini."
        : "Use voice only when you want to ask something. The presentation continues otherwise."
    : isAccessReady
      ? isGuidePrepared
        ? "The guide is ready. Start the walkthrough, then interrupt with voice when needed."
        : "Preparing the guide so the walkthrough starts faster."
      : accessState?.requiresPasscode
        ? "Add your name and passcode to open the presentation."
        : "Add your name to open the presentation.";

  return (
    <main className="beforest-shell">
      <div className="beforest-noise" aria-hidden="true" />

      <section className="beforest-story" aria-label="Beforest live walkthrough">
        {visual.videoUrl ? (
          <video
            key={`${visual.id}-${visual.videoUrl}`}
            className="beforest-story__image beforest-story__video"
            poster={visual.imageUrl}
            autoPlay
            muted
            loop
            playsInline
          >
            <source src={visual.videoUrl} type="video/mp4" />
          </video>
        ) : (
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
        )}

        <div className="beforest-story__scrim" aria-hidden="true" />

        <div className="beforest-story__overlay">
          <header className="beforest-heading" aria-live="polite">
            <p className="beforest-heading__kicker">{guideStage}</p>
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

            {!shouldShowAccessForm ? (
              <button
                type="button"
                className={[
                  "beforest-mic-button",
                  isLive ? "is-live" : "",
                  isMicOpen ? "is-open" : "",
                  isBusy || isMicBusy ? "is-busy" : "",
                  isBotSpeaking ? "is-speaking" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={handlePrimaryAction}
                disabled={!canUsePrimaryAction}
                aria-label={actionLabel}
                aria-pressed={isLive ? isMicOpen : undefined}
              >
                <span className="beforest-mic-button__ring" aria-hidden="true" />
                <span className="beforest-mic-button__surface">
                  {isBusy || isMicBusy ? (
                    <LoaderCircle size={24} className="spin" />
                  ) : isLive && isMicOpen ? (
                    <Send size={24} />
                  ) : (
                    <Mic size={24} />
                  )}
                </span>
                <span className="beforest-action-label">{actionLabel}</span>
              </button>
            ) : null}

            <p className="beforest-mic-hint" aria-live="polite">
              {micHint}
            </p>

            {shouldShowAccessForm ? (
              <form className="beforest-access-card" onSubmit={handleAccessSubmit}>
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
                  type="submit"
                  className="beforest-access-button"
                  disabled={isUnlocking}
                >
                  {isUnlocking ? "Opening..." : "Open presentation"}
                </button>
              </form>
            ) : null}

            {showDecisionCta ? (
              <div className="beforest-cta-card">
                <p className="beforest-cta-eyebrow">Choose the right next step</p>
                <h2 className="beforest-cta-title">The land will explain this more clearly than a pitch.</h2>
                <a
                  className="beforest-cta-button"
                  href={TRIAL_STAY_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Take a trial stay
                </a>
                <a
                  className="beforest-cta-button secondary"
                  href={FOUNDING_SILENCE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Subscribe for updates
                </a>
              </div>
            ) : null}
          </div>

          {promptModal ? (
            <div className="beforest-question-backdrop" role="presentation">
              <section className="beforest-question-modal" role="dialog" aria-modal="true" aria-labelledby="beforest-question-title">
                <p className="beforest-question-eyebrow">A useful pause</p>
                <h2 id="beforest-question-title">{promptModal.question}</h2>
                {promptModal.context ? <p className="beforest-question-context">{promptModal.context}</p> : null}
                <div className="beforest-question-options">
                  {promptModal.suggestedAnswers.map((answer) => (
                    <button
                      key={answer}
                      type="button"
                      onClick={() => handlePromptSubmit(answer)}
                    >
                      {answer}
                    </button>
                  ))}
                </div>
                <div className="beforest-question-actions">
                  <button
                    type="button"
                    className="beforest-question-skip"
                    onClick={() => {
                      const currentSection = getPresentationSection(currentSectionIdRef.current);
                      const nextSectionId = getNextSectionId(currentSection.id) || currentSection.id;
                      setPromptModal(null);
                      markSectionCompleted(currentSection.id);
                      sendPresenterSection(nextSectionId, "The listener skipped this question.");
                    }}
                  >
                    Skip
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          <div className="beforest-screen-frame" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
};
