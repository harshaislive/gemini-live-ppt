"use client";

import {
  ActivityHandling,
  GoogleGenAI,
  Modality,
  TurnCoverage,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { LoaderCircle, Mic, Pause, Play, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_VISUAL } from "./beforest";
import {
  NARRATION_CHUNKS,
  buildTranscriptWindow,
  getGateAfterChunk,
  getNarrationChunk,
  getNextNarrationChunk,
  type NarrationChunk,
  type NarrationChunkId,
  type NarrationGate,
} from "./presentationScript";
import {
  type BeforestVisual,
  type KnowledgeChunk,
} from "@/lib/beforest-shared";
import {
  bytesToBase64,
  extractAudioPayloadFromMessage,
  mergeRollingWords,
  takeLastWords,
} from "@/lib/gemini-live-utils";

type AccessState = {
  requiresPasscode: boolean;
  authorized: boolean;
};

type PresentationContext = {
  initialVisual: BeforestVisual;
  images: BeforestVisual[];
  knowledgeChunks: KnowledgeChunk[];
};

type GeminiToken = {
  name: string;
  model: string;
  newSessionExpireTime: string;
  expireTime: string;
  fetchedAt: number;
  runtimeContext: string;
};

type LivePhase = "idle" | "connecting" | "listening" | "answering" | "unavailable";

type RecorderState = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  worklet?: AudioWorkletNode;
  processor?: ScriptProcessorNode;
  hasSpeech: boolean;
};

type PromptModal = {
  id: string;
  question: string;
  context: string;
  suggestedAnswers: string[];
};

type SubscribeForm = {
  name: string;
  email: string;
  phone: string;
  interest: string;
  timing: string;
  firstUpdate: string;
};

type SubscribeQuestion = {
  id: keyof Pick<SubscribeForm, "interest" | "timing" | "firstUpdate">;
  eyebrow: string;
  question: string;
  context: string;
  options: string[];
};

const LISTENER_NAME_STORAGE_KEY = "beforest_listener_name";
const SUBSCRIBE_LEAD_STORAGE_KEY = "beforest_updates_lead";
const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const DEFAULT_VOICE_ID = "Gacrux";
const FOUNDING_SILENCE_URL = "https://10percent.beforest.co/the-founding-silence";
const TRIAL_STAY_URL = "https://hospitality.beforest.co";
const GEMINI_TOKEN_REFRESH_BUFFER_MS = 10_000;
const MIC_WORKLET_URL = "/audio-worklets/mic-pcm-processor.js";
const CONTINUOUS_BACKGROUND_VIDEO_URL = "/videos/beforest-10-percent-live-720.mp4";
const CONTINUOUS_BACKGROUND_POSTER_URL = "/posters/beforest-10-percent-live-poster.webp";
const SUBTITLE_LEAD_SECONDS = 0.3;
const LIVE_CONNECT_RETRY_DELAYS_MS = [650, 1400];
const SUBSCRIBE_QUESTIONS: SubscribeQuestion[] = [
  {
    id: "interest",
    eyebrow: "Signal 1 / Interest",
    question: "What should Beforest keep you close to?",
    context: "Choose the reason updates would be useful, so the next note can stay relevant.",
    options: ["Blyton trial stay", "10% membership", "Land restoration", "Family rhythm"],
  },
  {
    id: "timing",
    eyebrow: "Signal 2 / Timing",
    question: "When would this become real for you?",
    context: "This helps separate immediate trial intent from slower listening.",
    options: ["Next 30 days", "1-3 months", "Later this year", "Just learning"],
  },
  {
    id: "firstUpdate",
    eyebrow: "Signal 3 / First note",
    question: "What should arrive first?",
    context: "Pick the update that would make the next step clearer.",
    options: ["Blyton availability", "Membership overview", "Restoration stories", "Quiet launch notes"],
  },
];

function getMicCapabilityError() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!window.isSecureContext) {
    return "Microphone access needs localhost or HTTPS.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser cannot open the microphone here. Try Chrome on an HTTPS URL.";
  }
  return null;
}

function getMicrophoneRuntimeError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Microphone could not be opened in this browser session.";
  }

  const name = "name" in error ? String(error.name) : "";
  const message = error.message || "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission is blocked. Allow mic access in the browser, then tap again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect a mic or switch to a browser with mic access.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is already in use by another app. Close that app, then try again.";
  }
  if (name === "NotSupportedError" || /not supported/i.test(message)) {
    return "This browser session cannot provide a microphone. Try Chrome on the live HTTPS link.";
  }

  return message || "Microphone could not be opened in this browser session.";
}

function float32ToPcm16(input: Float32Array) {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] || 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function pcmBytesToLiveAudio(bytes: Uint8Array, sampleRate: number) {
  return {
    data: bytesToBase64(bytes),
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableLiveError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message || "";
  return /\b(503|service unavailable|unavailable|overloaded|try again)\b/i.test(message);
}

function getLiveConnectionError(error: unknown) {
  if (isRetryableLiveError(error)) {
    return "Gemini Live is temporarily unavailable. The walkthrough will continue; try the mic again in a moment.";
  }
  return getMicrophoneRuntimeError(error);
}

export const ClientApp: React.FC = () => {
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [listenerName, setListenerName] = useState("");
  const [hasConfirmedListener, setHasConfirmedListener] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [presentationContext, setPresentationContext] = useState<PresentationContext | null>(null);
  const [geminiToken, setGeminiToken] = useState<GeminiToken | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPresentationStarted, setIsPresentationStarted] = useState(false);
  const [isNarratorPaused, setIsNarratorPaused] = useState(false);
  const [currentChunkId, setCurrentChunkId] = useState<NarrationChunkId>(NARRATION_CHUNKS[0].id);
  const [narratorElapsedSeconds, setNarratorElapsedSeconds] = useState(0);
  const [narratorSubtitle, setNarratorSubtitle] = useState("");
  const [completedChunkIds, setCompletedChunkIds] = useState<NarrationChunkId[]>([]);
  const [answeredGateIds, setAnsweredGateIds] = useState<string[]>([]);
  const [promptModal, setPromptModal] = useState<PromptModal | null>(null);
  const [visual, setVisual] = useState<BeforestVisual>(INITIAL_VISUAL);
  const [livePhase, setLivePhase] = useState<LivePhase>("idle");
  const [isMicOpen, setIsMicOpen] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [userTranscript, setUserTranscript] = useState("");
  const [botTtsTranscript, setBotTtsTranscript] = useState("");
  const [liveAnswerText, setLiveAnswerText] = useState("");
  const [subscribeStep, setSubscribeStep] = useState<number | null>(null);
  const [subscribeForm, setSubscribeForm] = useState<SubscribeForm>({
    name: "",
    email: "",
    phone: "",
    interest: "",
    timing: "",
    firstUpdate: "",
  });
  const [subscribeError, setSubscribeError] = useState("");
  const [uiError, setUiError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const liveConnectPromiseRef = useRef<Promise<Session> | null>(null);
  const liveSocketOpenRef = useRef(false);
  const liveQuestionActiveRef = useRef(false);
  const recorderRef = useRef<RecorderState | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const activeLiveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextLivePlaybackTimeRef = useRef(0);
  const answerTimeoutRef = useRef<number | null>(null);
  const liveAnswerResumeTimeoutRef = useRef<number | null>(null);
  const preloadedNarrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastNarratorSubtitleRef = useRef("");
  const lastNarratorElapsedBucketRef = useRef(-1);
  const pendingBotTranscriptRef = useRef("");
  const fullBotTranscriptRef = useRef("");
  const userTranscriptRef = useRef("");
  const shouldResumeNarratorRef = useRef(false);
  const imagesRef = useRef<BeforestVisual[]>([]);
  const knowledgeRef = useRef<KnowledgeChunk[]>([]);

  const currentChunk = getNarrationChunk(currentChunkId);
  const isAccessReady = Boolean(accessState?.authorized && listenerName.trim() && hasConfirmedListener);
  const shouldShowNameForm = Boolean(accessState && !hasConfirmedListener);
  const shouldShowAccessForm = Boolean(accessState && (!accessState.authorized || shouldShowNameForm));
  const isLiveBusy = livePhase === "connecting" || livePhase === "answering";
  const canUsePrimaryAction = isAccessReady && !isPreparing && !promptModal && subscribeStep === null && !isLiveBusy;

  const guideStage = isPresentationStarted ? currentChunk.stageLabel : "Beforest 10% Life";
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
        ? takeLastWords(userTranscript.trim(), 12) || "Listening..."
        : "Speak, then tap again to close the question.";
    }
    if (livePhase === "answering") {
      return botTtsTranscript || "Answering your question, then we return to the narrator.";
    }
    if (livePhase === "connecting") {
      return "Opening the live mic with the current presentation context.";
    }
    if (isPresentationStarted) {
      return narratorSubtitle || buildTranscriptWindow(currentChunk.transcript, narratorElapsedSeconds, currentChunk.durationSeconds);
    }
    return "Start the presentation. The narrator plays immediately; the mic is only for interruptions.";
  }, [
    accessState,
    botTtsTranscript,
    currentChunk,
    isMicOpen,
    isPresentationStarted,
    isUserSpeaking,
    livePhase,
    narratorElapsedSeconds,
    narratorSubtitle,
    shouldShowAccessForm,
    userTranscript,
  ]);

  const showDecisionCta = visual.id === "trial-stay" || visual.id === "art-of-return-hero";
  const isLiveFocus = isMicOpen || livePhase === "connecting" || livePhase === "answering";
  const shouldShowDecisionCta = showDecisionCta && !isLiveFocus;
  const shouldTrackNarrationWords = isPresentationStarted && !isLiveFocus && !shouldShowAccessForm && !promptModal;
  const activeSubscribeQuestion = subscribeStep && subscribeStep > 0
    ? SUBSCRIBE_QUESTIONS[subscribeStep - 1]
    : null;
  const subscribeProgress = subscribeStep === null ? 0 : ((subscribeStep + 1) / (SUBSCRIBE_QUESTIONS.length + 1)) * 100;

  useEffect(() => {
    const storedName = window.localStorage.getItem(LISTENER_NAME_STORAGE_KEY);
    if (storedName) {
      setListenerName(storedName);
    }

    fetch("/api/access", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: AccessState) => setAccessState(data))
      .catch(() => setAccessState({ requiresPasscode: true, authorized: false }));

    return () => {
      stopRecorder();
      stopLivePlayback();
      void sessionRef.current?.close?.();
      sessionRef.current = null;
      if (outputAudioContextRef.current) {
        void outputAudioContextRef.current.close();
      }
      liveQuestionActiveRef.current = false;
      clearAnswerTimeout();
    };
  }, []);

  useEffect(() => {
    const sectionVisual = imagesRef.current.find((image) => image.id === currentChunk.visualId);
    setVisual((previous) => sectionVisual ? { ...sectionVisual, videoUrl: previous.videoUrl } : previous);
  }, [currentChunk.visualId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    void video.play().catch(() => {
      // Muted background video can still be blocked until the first user gesture.
    });
  }, [isPresentationStarted]);

  useEffect(() => {
    const nextChunk = getNextNarrationChunk(currentChunk.id);
    if (!nextChunk) {
      preloadedNarrationAudioRef.current = null;
      return;
    }

    const audio = new Audio(nextChunk.audioUrl);
    audio.preload = "metadata";
    audio.load();
    preloadedNarrationAudioRef.current = audio;

    return () => {
      audio.removeAttribute("src");
      audio.load();
      if (preloadedNarrationAudioRef.current === audio) {
        preloadedNarrationAudioRef.current = null;
      }
    };
  }, [currentChunk.id]);

  useEffect(() => {
    if (!isPresentationStarted || promptModal) {
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.preload = "auto";
    audio.src = currentChunk.audioUrl;
    audio.currentTime = 0;
    lastNarratorElapsedBucketRef.current = -1;
    lastNarratorSubtitleRef.current = "";
    setNarratorElapsedSeconds(0);
    setNarratorSubtitle(buildTranscriptWindow(currentChunk.transcript, 0, currentChunk.durationSeconds, SUBTITLE_LEAD_SECONDS));
    setIsNarratorPaused(false);
    void audio.play().catch((error) => {
      setIsNarratorPaused(true);
      setUiError(error instanceof Error ? error.message : "Could not start narration audio.");
    });
  }, [currentChunk.audioUrl, currentChunk.durationSeconds, currentChunk.transcript, isPresentationStarted, promptModal]);

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

  async function ensureGeminiToken(runtimeContext = "") {
    if (
      geminiToken &&
      geminiToken.runtimeContext === runtimeContext &&
      Date.parse(geminiToken.newSessionExpireTime) - Date.now() > GEMINI_TOKEN_REFRESH_BUFFER_MS
    ) {
      return geminiToken;
    }
    const response = await fetch("/api/gemini-live-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listenerName, runtimeContext }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const token = {
      ...((await response.json()) as Omit<GeminiToken, "fetchedAt" | "runtimeContext">),
      fetchedAt: Date.now(),
      runtimeContext,
    };
    setGeminiToken(token);
    return token;
  }

  async function handleAccessSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!listenerName.trim()) {
      setUiError("Please enter your name before you begin.");
      return;
    }
    window.localStorage.setItem(LISTENER_NAME_STORAGE_KEY, listenerName.trim());
    if (accessState?.authorized) {
      setHasConfirmedListener(true);
      setUiError(null);
      return;
    }
    if (!accessState?.requiresPasscode) {
      setAccessState({ requiresPasscode: false, authorized: true });
      setHasConfirmedListener(true);
      setUiError(null);
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
      setPasscode("");
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Unable to unlock the presentation.");
    } finally {
      setIsUnlocking(false);
    }
  }

  async function handleStartPresentation() {
    if (!isAccessReady) {
      setUiError("Add your name first so the presentation can open properly.");
      return;
    }
    setIsPreparing(true);
    setUiError(null);
    try {
      await ensurePresentationContext();
      setCompletedChunkIds([]);
      setAnsweredGateIds([]);
      setCurrentChunkId(NARRATION_CHUNKS[0].id);
      setIsPresentationStarted(true);
      setPromptModal(null);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Could not start the presentation.");
    } finally {
      setIsPreparing(false);
    }
  }

  function handleNarratorTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const elapsed = audio.currentTime;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : currentChunk.durationSeconds;
    const elapsedBucket = Math.floor(elapsed * 2);
    if (elapsedBucket !== lastNarratorElapsedBucketRef.current) {
      lastNarratorElapsedBucketRef.current = elapsedBucket;
      setNarratorElapsedSeconds(elapsed);
    }

    const nextSubtitle = buildTranscriptWindow(currentChunk.transcript, elapsed, duration, SUBTITLE_LEAD_SECONDS);
    if (nextSubtitle !== lastNarratorSubtitleRef.current) {
      lastNarratorSubtitleRef.current = nextSubtitle;
      setNarratorSubtitle(nextSubtitle);
    }
  }

  function handleNarratorEnded() {
    setCompletedChunkIds((previous) => (
      previous.includes(currentChunk.id) ? previous : [...previous, currentChunk.id]
    ));
    const gate = getGateAfterChunk(currentChunk.id);
    if (gate && !answeredGateIds.includes(gate.id)) {
      showGate(gate);
      return;
    }
    playNextChunk();
  }

  function showGate(gate: NarrationGate) {
    setIsNarratorPaused(true);
    setPromptModal({
      id: gate.id,
      question: gate.question,
      context: gate.context,
      suggestedAnswers: gate.options,
    });
  }

  function playNextChunk() {
    const nextChunk = getNextNarrationChunk(currentChunk.id);
    if (!nextChunk) {
      setIsNarratorPaused(true);
      return;
    }
    setNarratorElapsedSeconds(0);
    setNarratorSubtitle(buildTranscriptWindow(nextChunk.transcript, 0, nextChunk.durationSeconds, SUBTITLE_LEAD_SECONDS));
    setCurrentChunkId(nextChunk.id);
  }

  function handlePromptSubmit(answer: string) {
    if (!promptModal) {
      return;
    }
    setAnsweredGateIds((previous) => (
      previous.includes(promptModal.id) ? previous : [...previous, promptModal.id]
    ));
    setPromptModal(null);
    setBotTtsTranscript(`Noted: ${answer}`);
    playNextChunk();
  }

  function openSubscribeFlow() {
    setSubscribeForm((previous) => ({
      ...previous,
      name: previous.name || listenerName.trim(),
    }));
    setUiError(null);
    setSubscribeError("");
    setSubscribeStep(0);
  }

  function closeSubscribeFlow() {
    setSubscribeError("");
    setSubscribeStep(null);
  }

  function updateSubscribeField<Key extends keyof SubscribeForm>(field: Key, value: SubscribeForm[Key]) {
    setSubscribeForm((previous) => ({ ...previous, [field]: value }));
  }

  function submitSubscribeContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = subscribeForm.name.trim();
    const email = subscribeForm.email.trim();
    const phone = subscribeForm.phone.trim();
    if (!name || !email || !phone) {
      setSubscribeError("Add your name, email, and phone to continue.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSubscribeError("Enter a valid email address.");
      return;
    }
    setSubscribeForm((previous) => ({ ...previous, name, email, phone }));
    setSubscribeError("");
    setSubscribeStep(1);
  }

  function handleSubscribeAnswer(question: SubscribeQuestion, answer: string) {
    setSubscribeForm((previous) => {
      const next = { ...previous, [question.id]: answer };
      const nextStep = (subscribeStep ?? 1) + 1;
      if (nextStep > SUBSCRIBE_QUESTIONS.length) {
        window.localStorage.setItem(SUBSCRIBE_LEAD_STORAGE_KEY, JSON.stringify({
          ...next,
          capturedAt: new Date().toISOString(),
        }));
        const url = new URL(FOUNDING_SILENCE_URL);
        url.searchParams.set("name", next.name);
        url.searchParams.set("email", next.email);
        url.searchParams.set("phone", next.phone);
        url.searchParams.set("interest", next.interest);
        url.searchParams.set("timing", next.timing);
        url.searchParams.set("first_update", next.firstUpdate);
        window.open(url.toString(), "_blank", "noreferrer");
        setSubscribeStep(null);
      } else {
        setSubscribeStep(nextStep);
      }
      return next;
    });
  }

  function goBackSubscribeStep() {
    setSubscribeError("");
    setSubscribeStep((previous) => {
      if (previous === null || previous <= 0) {
        return null;
      }
      return previous - 1;
    });
  }

  function toggleNarratorPause() {
    const audio = audioRef.current;
    if (!audio || !isPresentationStarted || isLiveBusy || isMicOpen) {
      return;
    }
    if (audio.paused) {
      setIsNarratorPaused(false);
      void audio.play();
    } else {
      audio.pause();
      setIsNarratorPaused(true);
    }
  }

  function pauseNarratorForMic() {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
    setIsNarratorPaused(true);
    shouldResumeNarratorRef.current = true;
  }

  function resumeNarratorAfterLive() {
    if (!shouldResumeNarratorRef.current || promptModal) {
      return;
    }
    liveQuestionActiveRef.current = false;
    shouldResumeNarratorRef.current = false;
    const audio = audioRef.current;
    if (!audio || !isPresentationStarted) {
      return;
    }
    if (currentChunk.resumeMode === "restart_chunk") {
      audio.currentTime = 0;
    }
    setBotTtsTranscript("");
    setLiveAnswerText("");
    setUserTranscript("");
    userTranscriptRef.current = "";
    pendingBotTranscriptRef.current = "";
    fullBotTranscriptRef.current = "";
    setIsNarratorPaused(false);
    void audio.play().catch(() => setIsNarratorPaused(true));
  }

  async function ensureOutputAudioContext() {
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      nextLivePlaybackTimeRef.current = outputAudioContextRef.current.currentTime;
    }
    if (outputAudioContextRef.current.state === "suspended") {
      await outputAudioContextRef.current.resume();
    }
    return outputAudioContextRef.current;
  }

  function createPcmAudioBuffer(context: AudioContext, bytes: Uint8Array, sampleRate: number) {
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 0x8000;
    }
    return buffer;
  }

  function stopLivePlayback() {
    activeLiveSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    });
    activeLiveSourcesRef.current.clear();
    setIsBotSpeaking(false);
  }

  function clearAnswerTimeout() {
    if (answerTimeoutRef.current) {
      window.clearTimeout(answerTimeoutRef.current);
      answerTimeoutRef.current = null;
    }
  }

  function clearLiveAnswerResumeTimeout() {
    if (liveAnswerResumeTimeoutRef.current) {
      window.clearTimeout(liveAnswerResumeTimeoutRef.current);
      liveAnswerResumeTimeoutRef.current = null;
    }
  }

  function closeLiveSessionSoon() {
    window.setTimeout(() => {
      void sessionRef.current?.close?.();
      sessionRef.current = null;
      liveConnectPromiseRef.current = null;
      liveSocketOpenRef.current = false;
    }, 120);
  }

  function scheduleNarratorResumeAfterAnswer(delayMs = 650) {
    if (liveAnswerResumeTimeoutRef.current) {
      return;
    }
    liveAnswerResumeTimeoutRef.current = window.setTimeout(() => {
      liveAnswerResumeTimeoutRef.current = null;
      if (activeLiveSourcesRef.current.size) {
        scheduleNarratorResumeAfterAnswer(300);
        return;
      }
      setLivePhase("idle");
      resumeNarratorAfterLive();
      closeLiveSessionSoon();
    }, delayMs);
  }

  function scheduleAnswerFallback() {
    clearAnswerTimeout();
    answerTimeoutRef.current = window.setTimeout(() => {
      answerTimeoutRef.current = null;
      if (!liveSocketOpenRef.current || !sessionRef.current || activeLiveSourcesRef.current.size) {
        return;
      }
      const question = userTranscriptRef.current.trim();
      if (!question) {
        setUiError("I could not catch the question clearly. Please tap the mic and ask once more.");
        setLivePhase("idle");
        resumeNarratorAfterLive();
        closeLiveSessionSoon();
        return;
      }
      try {
        sessionRef.current.sendClientContent({
          turns: [{
            role: "user",
            parts: [{
              text: [
                "The listener just asked a question during the paused presentation.",
                `Live transcript: ${question}`,
                buildLiveTelemetryPrompt(currentChunk),
                "Answer this specific listener question briefly. Do not repeat a previous answer. End with the return line.",
              ].join("\n"),
            }],
          }],
          turnComplete: true,
        });
      } catch {
        setUiError("Gemini Live did not answer this question. Please try once more.");
        setLivePhase("unavailable");
        resumeNarratorAfterLive();
      }
    }, 5500);
  }

  async function scheduleLiveAudioPlayback(message: LiveServerMessage, subtitle: string) {
    const payload = extractAudioPayloadFromMessage(message);
    if (!payload) {
      return;
    }
    const context = await ensureOutputAudioContext();
    const audioBuffer = payload.mimeType.toLowerCase().startsWith("audio/pcm") || payload.mimeType.toLowerCase().startsWith("audio/l16")
      ? createPcmAudioBuffer(context, payload.bytes, payload.sampleRate)
      : await context.decodeAudioData(payload.bytes.buffer.slice(
          payload.bytes.byteOffset,
          payload.bytes.byteOffset + payload.bytes.byteLength,
        ) as ArrayBuffer);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, nextLivePlaybackTimeRef.current);
    nextLivePlaybackTimeRef.current = startAt + audioBuffer.duration;
    window.setTimeout(() => setBotTtsTranscript(subtitle), Math.max(0, (startAt - context.currentTime) * 1000));
    source.onended = () => {
      activeLiveSourcesRef.current.delete(source);
      if (!activeLiveSourcesRef.current.size) {
        setIsBotSpeaking(false);
        scheduleNarratorResumeAfterAnswer(650);
      }
    };
    activeLiveSourcesRef.current.add(source);
    setIsBotSpeaking(true);
    source.start(startAt);
  }

  async function handleLiveMessage(message: LiveServerMessage) {
    if (message.serverContent?.inputTranscription?.text) {
      const text = message.serverContent.inputTranscription.text.trim();
      if (text) {
        userTranscriptRef.current = mergeRollingWords(userTranscriptRef.current, text, 48);
        setUserTranscript(userTranscriptRef.current);
      }
    }
    if (message.serverContent?.outputTranscription?.text) {
      clearAnswerTimeout();
      const text = message.serverContent.outputTranscription.text.trim();
      if (text) {
        pendingBotTranscriptRef.current = mergeRollingWords(pendingBotTranscriptRef.current, text, 16);
        fullBotTranscriptRef.current = mergeRollingWords(fullBotTranscriptRef.current, text, 1000);
        setBotTtsTranscript(pendingBotTranscriptRef.current);
        setLiveAnswerText(fullBotTranscriptRef.current);
      }
    }
    if (message.serverContent?.interrupted) {
      stopLivePlayback();
    }
    if (extractAudioPayloadFromMessage(message)) {
      clearAnswerTimeout();
      await scheduleLiveAudioPlayback(message, pendingBotTranscriptRef.current);
    }
    if (message.serverContent?.turnComplete || message.serverContent?.generationComplete) {
      setLivePhase("answering");
      if (!activeLiveSourcesRef.current.size) {
        scheduleNarratorResumeAfterAnswer(900);
      }
    }
  }

  function buildLiveTelemetryPrompt(chunk: NarrationChunk) {
    const audio = audioRef.current;
    const elapsed = audio ? Math.round(audio.currentTime) : Math.round(narratorElapsedSeconds);
    return [
      `Current chunk: ${chunk.id}`,
      `Current stage: ${chunk.stageLabel}`,
      `Elapsed in chunk: ${elapsed}s`,
      `Completed chunks: ${completedChunkIds.join(", ") || "none"}`,
      `Current visual: ${visual.id}`,
      `Narrator transcript for this chunk: ${chunk.transcript}`,
      `Return line to use before handing back: ${chunk.returnLine}`,
    ].join("\n");
  }

  async function ensureLiveSession() {
    if (sessionRef.current) {
      return sessionRef.current;
    }
    if (liveConnectPromiseRef.current) {
      return liveConnectPromiseRef.current;
    }

    setLivePhase("connecting");
    pendingBotTranscriptRef.current = "";
    fullBotTranscriptRef.current = "";
    userTranscriptRef.current = "";
    setBotTtsTranscript("");
    setLiveAnswerText("");
    const promise = (async () => {
      const token = await ensureGeminiToken(buildLiveTelemetryPrompt(currentChunk));
      const ai = new GoogleGenAI({ apiKey: token.name, apiVersion: "v1alpha" });
      let markLiveOpen: (() => void) | null = null;
      const liveOpenPromise = new Promise<void>((resolve) => {
        markLiveOpen = resolve;
      });
      const connectConfig = {
        model: token.model || MODEL,
        callbacks: {
          onopen: () => {
            liveSocketOpenRef.current = true;
            markLiveOpen?.();
            if (liveQuestionActiveRef.current) {
              setLivePhase("listening");
            }
          },
          onmessage: (message: LiveServerMessage) => {
            void handleLiveMessage(message);
          },
          onerror: (event: ErrorEvent) => {
            liveSocketOpenRef.current = false;
            sessionRef.current = null;
            liveConnectPromiseRef.current = null;
            setLivePhase("unavailable");
            setUiError(event.message || "Gemini Live connection failed.");
            stopRecorder();
            stopLivePlayback();
            clearAnswerTimeout();
            clearLiveAnswerResumeTimeout();
            if (!liveQuestionActiveRef.current) {
              window.setTimeout(resumeNarratorAfterLive, 300);
            }
          },
          onclose: () => {
            liveSocketOpenRef.current = false;
            sessionRef.current = null;
            liveConnectPromiseRef.current = null;
            stopRecorder();
            clearAnswerTimeout();
            setLivePhase((phase) => phase === "answering" && activeLiveSourcesRef.current.size ? phase : "idle");
            if (!activeLiveSourcesRef.current.size && !liveQuestionActiveRef.current) {
              window.setTimeout(resumeNarratorAfterLive, 300);
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
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
                voiceName: process.env.NEXT_PUBLIC_GOOGLE_VOICE_ID || DEFAULT_VOICE_ID,
              },
            },
          },
        },
      };
      let liveSession: Session | null = null;
      for (let attemptIndex = 0; attemptIndex <= LIVE_CONNECT_RETRY_DELAYS_MS.length; attemptIndex += 1) {
        try {
          liveSession = await ai.live.connect(connectConfig);
          break;
        } catch (error) {
          if (!isRetryableLiveError(error) || attemptIndex === LIVE_CONNECT_RETRY_DELAYS_MS.length) {
            throw error;
          }
          await sleep(LIVE_CONNECT_RETRY_DELAYS_MS[attemptIndex]);
        }
      }
      if (!liveSession) {
        throw new Error("Gemini Live connection failed.");
      }
      sessionRef.current = liveSession;
      setGeminiToken(null);
      await Promise.race([
        liveOpenPromise,
        new Promise<void>((_, reject) => {
          window.setTimeout(() => reject(new Error("Gemini Live did not open in time.")), 6000);
        }),
      ]);
      return liveSession;
    })();

    liveConnectPromiseRef.current = promise;
    return promise;
  }

  async function handleOpenMic() {
    const micCapabilityError = getMicCapabilityError();
    if (micCapabilityError) {
      setUiError(micCapabilityError);
      return;
    }
    liveQuestionActiveRef.current = true;
    clearLiveAnswerResumeTimeout();
    setUiError(null);
    setUserTranscript("");
    userTranscriptRef.current = "";
    pendingBotTranscriptRef.current = "";
    fullBotTranscriptRef.current = "";
    setBotTtsTranscript("");
    setLiveAnswerText("");

    const openedStreams: MediaStream[] = [];
    let pendingSessionPromise: Promise<Session> | null = null;
    try {
      const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        openedStreams.push(stream);
        return stream;
      });
      const sessionPromise = ensureLiveSession();
      pendingSessionPromise = sessionPromise;
      const [session, stream] = await Promise.all([sessionPromise, streamPromise]);
      pauseNarratorForMic();
      const context = new AudioContext({ sampleRate: 16000 });
      if (context.state === "suspended") {
        await context.resume();
      }
      const source = context.createMediaStreamSource(stream);
      const gain = context.createGain();
      gain.gain.value = 0;
      recorderRef.current = { stream, context, source, gain, hasSpeech: false };
      gain.connect(context.destination);
      if (liveSocketOpenRef.current) {
        session.sendRealtimeInput({ activityStart: {} });
      }

      if (context.audioWorklet) {
        await context.audioWorklet.addModule(MIC_WORKLET_URL);
        const worklet = new AudioWorkletNode(context, "mic-pcm-processor");
        worklet.port.onmessage = (event: MessageEvent<{ pcm?: ArrayBuffer; energy?: number }>) => {
          const recorder = recorderRef.current;
          if (!recorder || !event.data.pcm) {
            return;
          }
          const isSpeaking = (event.data.energy || 0) > 0.015;
          recorder.hasSpeech = recorder.hasSpeech || isSpeaking;
          setIsUserSpeaking(isSpeaking);
          if (!liveSocketOpenRef.current || sessionRef.current !== session) {
            return;
          }
          try {
            session.sendRealtimeInput({
              audio: pcmBytesToLiveAudio(new Uint8Array(event.data.pcm), context.sampleRate),
            });
          } catch {
            stopRecorder();
            setLivePhase("unavailable");
          }
        };
        recorderRef.current.worklet = worklet;
        source.connect(worklet);
        worklet.connect(gain);
      } else {
        const processor = context.createScriptProcessor(4096, 1, 1);
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
          recorder.hasSpeech = recorder.hasSpeech || isSpeaking;
          setIsUserSpeaking(isSpeaking);
          if (!liveSocketOpenRef.current || sessionRef.current !== session) {
            return;
          }
          const pcm16 = float32ToPcm16(input);
          try {
            session.sendRealtimeInput({
              audio: pcmBytesToLiveAudio(new Uint8Array(pcm16.buffer), context.sampleRate),
            });
          } catch {
            stopRecorder();
            setLivePhase("unavailable");
          }
        };
        recorderRef.current.processor = processor;
        source.connect(processor);
        processor.connect(gain);
      }

      setIsMicOpen(true);
      setLivePhase("listening");
    } catch (error) {
      setLivePhase("unavailable");
      setUiError(getLiveConnectionError(error));
      openedStreams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      stopRecorder();
      clearAnswerTimeout();
      clearLiveAnswerResumeTimeout();
      liveQuestionActiveRef.current = false;
      void pendingSessionPromise?.then((session) => session.close()).catch(() => undefined);
      void sessionRef.current?.close?.();
      sessionRef.current = null;
      liveConnectPromiseRef.current = null;
      liveSocketOpenRef.current = false;
      window.setTimeout(resumeNarratorAfterLive, 300);
    }
  }

  function stopRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) {
      setIsMicOpen(false);
      setIsUserSpeaking(false);
      return;
    }
    try {
      recorder.worklet?.disconnect();
      recorder.worklet?.port.close();
      recorder.processor?.disconnect();
      recorder.source.disconnect();
      recorder.gain.disconnect();
    } catch {
      // Already disconnected.
    }
    recorder.stream.getTracks().forEach((track) => track.stop());
    void recorder.context.close();
    setIsMicOpen(false);
    setIsUserSpeaking(false);
  }

  async function handleCloseMic() {
    const recorder = recorderRef.current;
    stopRecorder();
    if (!recorder) {
      liveQuestionActiveRef.current = false;
      setLivePhase("idle");
      resumeNarratorAfterLive();
      return;
    }
    if (!recorder.hasSpeech && !userTranscriptRef.current.trim()) {
      liveQuestionActiveRef.current = false;
      setLivePhase("idle");
      setBotTtsTranscript("");
      setLiveAnswerText("");
      closeLiveSessionSoon();
      resumeNarratorAfterLive();
      return;
    }
    setLivePhase("answering");
    liveQuestionActiveRef.current = false;
    if (liveSocketOpenRef.current) {
      sessionRef.current?.sendRealtimeInput({ activityEnd: {} });
      scheduleAnswerFallback();
    } else {
      setUiError("The live mic closed before the question could be sent. Please try again.");
      setLivePhase("unavailable");
      resumeNarratorAfterLive();
    }
  }

  function handlePrimaryAction() {
    if (!isPresentationStarted) {
      void handleStartPresentation();
      return;
    }
    if (isMicOpen) {
      void handleCloseMic();
      return;
    }
    void handleOpenMic();
  }

  const actionLabel = isPreparing || livePhase === "connecting"
    ? "Opening"
    : !isPresentationStarted
      ? "Begin walkthrough"
      : isMicOpen
        ? "Send question"
        : "Ask a question";
  const micHint = isPresentationStarted
    ? isMicOpen
      ? "Speak now. Tap send when your question is complete."
      : "Tap the mic to pause the narrator and ask one question."
    : "The presentation starts from committed audio, so there is no live wait at the beginning.";

  const livePanelTitle = livePhase === "answering" || liveAnswerText
    ? "Response"
    : isMicOpen
      ? "Speak now"
      : "Preparing mic";
  const livePanelText = livePhase === "answering" || liveAnswerText
    ? liveAnswerText || botTtsTranscript || "Answering now..."
    : userTranscript.trim() || "Ask your question naturally. When you are done, tap the send icon so the guide can answer and return to the walkthrough.";

  function renderSubtitle(text: string) {
    return text;
  }

  function renderTrackedNarrationSubtitle() {
    const words = currentChunk.transcript.split(/\s+/).filter(Boolean);
    const wordsPerPhrase = 5;
    const phraseSeconds = 2.7;
    const phraseIndex = Math.max(0, Math.floor((narratorElapsedSeconds + SUBTITLE_LEAD_SECONDS) / phraseSeconds));
    const start = Math.min(
      Math.max(0, words.length - wordsPerPhrase),
      phraseIndex * wordsPerPhrase,
    );
    const end = Math.min(words.length, start + wordsPerPhrase);
    return words.slice(start, end).join(" ");
  }

  return (
    <main className="beforest-shell">
      <div className="beforest-noise" aria-hidden="true" />
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={handleNarratorTimeUpdate}
        onEnded={handleNarratorEnded}
      />

      <section
        className={[
          "beforest-story",
          isLiveFocus ? "is-live-focus" : "",
          isMicOpen ? "is-listening" : "",
          livePhase === "answering" ? "is-answering" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Beforest controlled walkthrough"
      >
        <video
          ref={videoRef}
          className="beforest-story__image beforest-story__video"
          poster={CONTINUOUS_BACKGROUND_POSTER_URL}
          autoPlay
          muted
          loop
          playsInline
        >
          <source src={CONTINUOUS_BACKGROUND_VIDEO_URL} type="video/mp4" />
        </video>

        <div className="beforest-story__scrim" aria-hidden="true" />

        <div className="beforest-story__overlay">
          <header key={currentChunk.id} className="beforest-heading" aria-live="polite">
            <p className="beforest-heading__kicker">{guideStage}</p>
            <h1 className="beforest-heading__title">{visual.hook}</h1>
          </header>

          {isLiveFocus ? (
            <section
              className={[
                "beforest-live-answer",
                livePhase === "answering" || liveAnswerText ? "is-answer" : "",
                isBotSpeaking ? "is-speaking" : "",
              ].filter(Boolean).join(" ")}
              aria-live="polite"
              aria-label={livePanelTitle}
            >
              <div className="beforest-live-answer__meta">
                <span>{livePanelTitle}</span>
                {isBotSpeaking ? <span className="beforest-live-answer__pulse" aria-hidden="true" /> : null}
              </div>
              {livePanelText ? (
                <p className="beforest-live-answer__text">{livePanelText}</p>
              ) : null}
            </section>
          ) : null}

          <div className={[
            "beforest-bottom-ui",
            shouldShowDecisionCta ? "is-cta-mode" : "",
            isLiveFocus ? "is-live-mode" : "",
          ].filter(Boolean).join(" ")}>
            {uiError ? (
              <p className="beforest-inline-error" role="alert">
                {uiError}
              </p>
            ) : null}

            <p
              className={[
                "beforest-subtitle",
                displayedSubtitle ? "visible" : "",
                isLiveFocus ? "is-live" : "",
                shouldTrackNarrationWords ? "is-tracked" : "",
              ].filter(Boolean).join(" ")}
              aria-live="polite"
              aria-label={displayedSubtitle}
            >
              {shouldTrackNarrationWords ? renderTrackedNarrationSubtitle() : renderSubtitle(displayedSubtitle)}
            </p>

            {!shouldShowAccessForm ? (
              <div className={[
                "beforest-action-row",
                isPresentationStarted ? "is-started" : "is-start",
              ].join(" ")}>
                <button
                  type="button"
                  className={[
                    "beforest-mic-button",
                    isPresentationStarted ? "is-live" : "",
                    isMicOpen ? "is-open" : "",
                    isPreparing || livePhase === "connecting" ? "is-busy" : "",
                    isBotSpeaking || livePhase === "answering" ? "is-speaking" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={handlePrimaryAction}
                  disabled={!canUsePrimaryAction}
                  aria-label={actionLabel}
                  aria-pressed={isMicOpen}
                >
                  <span className="beforest-mic-button__ring" aria-hidden="true" />
                  <span className="beforest-mic-button__surface">
                    {isPreparing || livePhase === "connecting" ? (
                      <LoaderCircle size={24} className="spin" />
                    ) : !isPresentationStarted ? (
                      <Play size={24} />
                    ) : isMicOpen ? (
                      <Send size={24} />
                    ) : (
                      <Mic size={24} />
                    )}
                  </span>
                  <span className="beforest-action-label">{actionLabel}</span>
                </button>

                {isPresentationStarted ? (
                  <button
                    type="button"
                    className="beforest-secondary-action"
                    onClick={toggleNarratorPause}
                    disabled={isLiveBusy || isMicOpen}
                    aria-label={isNarratorPaused ? "Resume narration" : "Pause narration"}
                    title={isNarratorPaused ? "Resume narration" : "Pause narration"}
                  >
                    {isNarratorPaused ? <Play size={18} /> : <Pause size={18} />}
                  </button>
                ) : null}
              </div>
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
                <button type="submit" className="beforest-access-button" disabled={isUnlocking}>
                  {isUnlocking ? "Opening..." : "Open presentation"}
                </button>
              </form>
            ) : null}

            {shouldShowDecisionCta ? (
              <div className="beforest-cta-card">
                <p className="beforest-cta-eyebrow">Choose the right next step</p>
                <h2 className="beforest-cta-title">The land will explain this more clearly than a pitch.</h2>
                <a className="beforest-cta-button" href={TRIAL_STAY_URL} target="_blank" rel="noreferrer">
                  Take a trial stay
                </a>
                <button type="button" className="beforest-cta-button secondary" onClick={openSubscribeFlow}>
                  Subscribe for updates
                </button>
              </div>
            ) : null}
          </div>

          {promptModal ? (
            <div className="beforest-question-backdrop" role="presentation">
              <section className="beforest-question-modal" role="dialog" aria-modal="true" aria-labelledby="beforest-question-title">
                <p className="beforest-question-eyebrow">A useful pause</p>
                <h2 id="beforest-question-title">{promptModal.question}</h2>
                <p className="beforest-question-context">{promptModal.context}</p>
                <div className="beforest-question-options">
                  {promptModal.suggestedAnswers.map((answer) => (
                    <button key={answer} type="button" onClick={() => handlePromptSubmit(answer)}>
                      {answer}
                    </button>
                  ))}
                </div>
                <div className="beforest-question-actions">
                  <button type="button" className="beforest-question-skip" onClick={() => handlePromptSubmit("Skipped")}>
                    Skip
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {subscribeStep !== null ? (
            <div className="beforest-question-backdrop" role="presentation">
              <section
                className="beforest-question-modal beforest-subscribe-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="beforest-subscribe-title"
              >
                <div className="beforest-subscribe-progress" aria-hidden="true">
                  <span style={{ width: `${subscribeProgress}%` }} />
                </div>

                {subscribeStep === 0 ? (
                  <form className="beforest-subscribe-form" onSubmit={submitSubscribeContact}>
                    <p className="beforest-question-eyebrow">Updates / Contact</p>
                    <h2 id="beforest-subscribe-title">Where should Beforest reach you?</h2>
                    <p className="beforest-question-context">
                      Share the essentials first. The next three taps help shape what you receive.
                    </p>
                    {subscribeError ? (
                      <p className="beforest-subscribe-error" role="alert">
                        {subscribeError}
                      </p>
                    ) : null}
                    <div className="beforest-subscribe-fields">
                      <input
                        className="beforest-subscribe-input"
                        type="text"
                        value={subscribeForm.name}
                        onChange={(event) => updateSubscribeField("name", event.target.value)}
                        placeholder="Name"
                        autoComplete="name"
                      />
                      <input
                        className="beforest-subscribe-input"
                        type="email"
                        value={subscribeForm.email}
                        onChange={(event) => updateSubscribeField("email", event.target.value)}
                        placeholder="Email"
                        autoComplete="email"
                      />
                      <input
                        className="beforest-subscribe-input"
                        type="tel"
                        value={subscribeForm.phone}
                        onChange={(event) => updateSubscribeField("phone", event.target.value)}
                        placeholder="Phone"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="beforest-question-actions beforest-subscribe-actions">
                      <button type="button" className="beforest-question-skip" onClick={closeSubscribeFlow}>
                        Close
                      </button>
                      <button type="submit" className="beforest-subscribe-next">
                        Continue
                      </button>
                    </div>
                  </form>
                ) : activeSubscribeQuestion ? (
                  <>
                    <p className="beforest-question-eyebrow">{activeSubscribeQuestion.eyebrow}</p>
                    <h2 id="beforest-subscribe-title">{activeSubscribeQuestion.question}</h2>
                    <p className="beforest-question-context">{activeSubscribeQuestion.context}</p>
                    <div className="beforest-question-options beforest-subscribe-options">
                      {activeSubscribeQuestion.options.map((answer) => (
                        <button
                          key={answer}
                          type="button"
                          className={subscribeForm[activeSubscribeQuestion.id] === answer ? "is-selected" : ""}
                          onClick={() => handleSubscribeAnswer(activeSubscribeQuestion, answer)}
                        >
                          {answer}
                        </button>
                      ))}
                    </div>
                    <div className="beforest-question-actions beforest-subscribe-actions">
                      <button type="button" className="beforest-question-skip" onClick={goBackSubscribeStep}>
                        Back
                      </button>
                      <button type="button" className="beforest-question-skip" onClick={closeSubscribeFlow}>
                        Close
                      </button>
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          ) : null}

          <div className="beforest-screen-frame" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
};
