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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_VISUAL } from "./beforest";
import {
  NARRATION_CHUNKS,
  PREPARED_FAQS,
  getGateAfterChunk,
  getNarrationChunk,
  getNarrationCaption,
  getNextNarrationChunk,
  getPromptAnswerAction,
  type NarrationChunk,
  type NarrationChunkId,
  type NarrationGate,
  type PreparedFaq,
} from "./presentationScript";
import {
  type BeforestVisual,
  type KnowledgeChunk,
} from "@/lib/beforest-shared";
import {
  bytesToBase64,
  extractAudioPayloadFromMessage,
  mergeRollingWords,
} from "@/lib/gemini-live-utils";

const ENABLE_BETWEEN_SLIDE_PROMPTS = false;

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

type AmbientState = {
  context: AudioContext;
  masterGain: GainNode;
  source: AudioBufferSourceNode;
  chirpTimeout: number | null;
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

type BrowserSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const LISTENER_NAME_STORAGE_KEY = "beforest_listener_name";
const SUBSCRIBE_LEAD_STORAGE_KEY = "beforest_updates_lead";
const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const DEFAULT_VOICE_ID = "Gacrux";
const TRIAL_STAY_URL = "https://hospitality.beforest.co";
const GEMINI_TOKEN_REFRESH_BUFFER_MS = 10_000;
const MIC_WORKLET_URL = "/audio-worklets/mic-pcm-processor.js";
const FALLBACK_BACKGROUND_VIDEO_URL = "/videos/beforest-10-percent-live-720.mp4";
const CONTINUOUS_BACKGROUND_POSTER_URL = "/posters/beforest-10-percent-live-poster.webp";
const VIDEO_AMBIENT_VOLUME = 0.09;
const VIDEO_AMBIENT_DUCKED_VOLUME = 0.035;
const SUBTITLE_LEAD_SECONDS = 0.3;
const AMBIENT_GAIN = 0;
const AMBIENT_DUCKED_GAIN = 0;
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

function isInterruptedMediaPlayError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  const message = error.message || "";
  return name === "AbortError"
    || /play\(\) request was interrupted/i.test(message)
    || /interrupted by a call to pause/i.test(message)
    || /interrupted by a new load request/i.test(message);
}

function getBrowserSpeechRecognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
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
  const message = error instanceof Error
    ? error.message || ""
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  if (!message) {
    return false;
  }
  return /\b(503|service unavailable|unavailable|overloaded|try again)\b/i.test(message);
}

function getLiveConnectionError(error: unknown) {
  if (isRetryableLiveError(error)) {
    return "Gemini Live is temporarily unavailable. The walkthrough will continue; try the mic again in a moment.";
  }
  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) {
      return "Gemini Live could not complete that turn. Returning to the walkthrough.";
    }
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
  const [, setIsUserSpeaking] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [userTranscript, setUserTranscript] = useState("");
  const [botTtsTranscript, setBotTtsTranscript] = useState("");
  const [liveAnswerText, setLiveAnswerText] = useState("");
  const [subscribeStep, setSubscribeStep] = useState<number | null>(null);
  const [activeFaqId, setActiveFaqId] = useState<string | null>(null);
  const [isFaqReading, setIsFaqReading] = useState(false);
  const [backgroundVideos, setBackgroundVideos] = useState<string[]>([FALLBACK_BACKGROUND_VIDEO_URL]);
  const [backgroundVideoIndex, setBackgroundVideoIndex] = useState(0);
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
  const faqAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const liveConnectPromiseRef = useRef<Promise<Session> | null>(null);
  const liveSocketOpenRef = useRef(false);
  const liveQuestionActiveRef = useRef(false);
  const recorderRef = useRef<RecorderState | null>(null);
  const localSpeechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const localSpeechFinalRef = useRef("");
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const ambientRef = useRef<AmbientState | null>(null);
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
  const activeNarrationAudioUrlRef = useRef<string | null>(null);
  const initialNarrationStartPromiseRef = useRef<Promise<void> | null>(null);
  const ambientStartPromiseRef = useRef<Promise<void> | null>(null);
  const imagesRef = useRef<BeforestVisual[]>([]);
  const knowledgeRef = useRef<KnowledgeChunk[]>([]);

  const currentChunk = getNarrationChunk(currentChunkId);
  const isAccessReady = Boolean(accessState?.authorized && listenerName.trim() && hasConfirmedListener);
  const shouldShowNameForm = Boolean(accessState && !hasConfirmedListener);
  const shouldShowAccessForm = Boolean(accessState && (!accessState.authorized || shouldShowNameForm));
  const isLiveBusy = livePhase === "connecting" || livePhase === "answering";
  const canUsePrimaryAction = isAccessReady
    && !isPreparing
    && !promptModal
    && subscribeStep === null
    && livePhase !== "connecting";

  const guideStage = isPresentationStarted ? currentChunk.stageLabel : "Beforest 10% Life";
  const hasCapturedQuestion = Boolean(userTranscript.trim());
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
      return hasCapturedQuestion
        ? "Question captured. Tap send when complete."
        : "Speak, then tap send when complete.";
    }
    if (livePhase === "answering") {
      return botTtsTranscript || "Answering your question, then we return to the narrator.";
    }
    if (livePhase === "connecting") {
      return "Opening the live mic with the current presentation context.";
    }
    if (isPresentationStarted) {
      return narratorSubtitle || getNarrationCaption(currentChunk, narratorElapsedSeconds, currentChunk.durationSeconds);
    }
    return "Start the presentation. The narrator plays immediately; the mic is only for interruptions.";
  }, [
    accessState,
    botTtsTranscript,
    currentChunk,
    hasCapturedQuestion,
    isMicOpen,
    isPresentationStarted,
    livePhase,
    narratorElapsedSeconds,
    narratorSubtitle,
    shouldShowAccessForm,
  ]);

  const showDecisionCta = visual.id === "trial-stay" || visual.id === "art-of-return-hero";
  const isLiveFocus = isMicOpen || livePhase === "answering";
  const shouldShowDecisionCta = showDecisionCta && !isLiveFocus;
  const shouldTrackNarrationWords = isPresentationStarted && !isLiveFocus && !shouldShowAccessForm && !promptModal;
  const activeSubscribeQuestion = subscribeStep && subscribeStep > 0
    ? SUBSCRIBE_QUESTIONS[subscribeStep - 1]
    : null;
  const isSubscribeComplete = subscribeStep === SUBSCRIBE_QUESTIONS.length + 1;
  const subscribeProgress = subscribeStep === null ? 0 : Math.min(100, ((subscribeStep + 1) / (SUBSCRIBE_QUESTIONS.length + 1)) * 100);
  const activeFaq = activeFaqId
    ? PREPARED_FAQS.find((faq) => faq.id === activeFaqId) || PREPARED_FAQS[0]
    : null;
  const shouldDuckAmbient = isLiveFocus || Boolean(activeFaq) || subscribeStep !== null;
  const activeBackgroundVideoUrl = backgroundVideos[backgroundVideoIndex] || FALLBACK_BACKGROUND_VIDEO_URL;

  const prepareNarrationCue = useCallback((chunk: NarrationChunk) => {
    lastNarratorElapsedBucketRef.current = -1;
    lastNarratorSubtitleRef.current = "";
    setNarratorElapsedSeconds(0);
    setNarratorSubtitle(getNarrationCaption(chunk, 0, chunk.durationSeconds, SUBTITLE_LEAD_SECONDS));
  }, []);

  const playNarrationChunk = useCallback((chunk: NarrationChunk, options: { reportError: boolean }) => {
    const audio = audioRef.current;
    if (!audio) {
      return Promise.resolve();
    }

    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    if (activeNarrationAudioUrlRef.current !== chunk.audioUrl || audio.getAttribute("src") !== chunk.audioUrl) {
      audio.src = chunk.audioUrl;
      audio.load();
    }
    audio.currentTime = 0;
    activeNarrationAudioUrlRef.current = chunk.audioUrl;
    prepareNarrationCue(chunk);
    setIsNarratorPaused(false);

    return audio.play().then(() => undefined).catch((error) => {
      if (isInterruptedMediaPlayError(error)) {
        return;
      }
      setIsNarratorPaused(true);
      if (options.reportError) {
        setUiError(error instanceof Error ? error.message : "Could not start narration audio.");
      }
      throw error;
    });
  }, [prepareNarrationCue]);

  const configureBackgroundVideo = useCallback((video: HTMLVideoElement, shouldUseAmbientAudio: boolean) => {
    video.loop = false;
    video.playsInline = true;
    video.muted = !shouldUseAmbientAudio;
    video.volume = shouldUseAmbientAudio
      ? (shouldDuckAmbient ? VIDEO_AMBIENT_DUCKED_VOLUME : VIDEO_AMBIENT_VOLUME)
      : 0;
  }, [shouldDuckAmbient]);

  useEffect(() => {
    const activeLiveSources = activeLiveSourcesRef.current;
    const storedName = window.localStorage.getItem(LISTENER_NAME_STORAGE_KEY);
    if (storedName) {
      setListenerName(storedName);
    }

    fetch("/api/access", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: AccessState) => setAccessState(data))
      .catch(() => setAccessState({ requiresPasscode: true, authorized: false }));

    fetch("/api/background-videos", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { videos?: unknown }) => {
        if (!Array.isArray(data.videos)) {
          return;
        }
        const videos = data.videos.filter((video): video is string => (
          typeof video === "string" && video.startsWith("/videos/") && video.endsWith(".mp4")
        ));
        if (videos.length) {
          setBackgroundVideos(videos);
          setBackgroundVideoIndex(0);
        }
      })
      .catch(() => undefined);

    return () => {
      stopFaqReading();
      stopAmbientBed();
      stopLocalSpeechPreview();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder) {
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
      }
      activeLiveSources.forEach((source) => {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      });
      activeLiveSources.clear();
      void sessionRef.current?.close?.();
      sessionRef.current = null;
      liveConnectPromiseRef.current = null;
      liveSocketOpenRef.current = false;
      if (outputAudioContextRef.current) {
        void outputAudioContextRef.current.close();
      }
      liveQuestionActiveRef.current = false;
      clearAnswerTimeout();
      clearLiveAnswerResumeTimeout();
    };
  }, []);

  useEffect(() => {
    if (!isPresentationStarted) {
      setAmbientGain(0);
      setVideoAmbientVolume(0);
      return;
    }
    setAmbientGain(shouldDuckAmbient ? AMBIENT_DUCKED_GAIN : AMBIENT_GAIN);
    setVideoAmbientVolume(shouldDuckAmbient ? VIDEO_AMBIENT_DUCKED_VOLUME : VIDEO_AMBIENT_VOLUME);
  }, [isPresentationStarted, shouldDuckAmbient]);

  useEffect(() => {
    const sectionVisual = imagesRef.current.find((image) => image.id === currentChunk.visualId);
    setVisual((previous) => sectionVisual ? { ...sectionVisual, videoUrl: previous.videoUrl } : previous);
  }, [currentChunk.visualId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    configureBackgroundVideo(video, isPresentationStarted);
    video.load();
    void video.play().catch(() => {
      // iOS may still block media until the first user gesture; the primary button primes it.
    });
  }, [activeBackgroundVideoUrl, configureBackgroundVideo, isPresentationStarted]);

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

    if (
      activeNarrationAudioUrlRef.current === currentChunk.audioUrl
      && audioRef.current
      && !audioRef.current.paused
    ) {
      return;
    }

    void playNarrationChunk(currentChunk, { reportError: true });
  }, [currentChunk, isPresentationStarted, playNarrationChunk, promptModal]);

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
    const initialAudioStart = primeInitialNarrationPlayback({ reportError: false });
    const ambientStart = startAmbientBed().catch(() => undefined);
    try {
      await ensurePresentationContext();
      await ambientStart;
      setCompletedChunkIds([]);
      setAnsweredGateIds([]);
      setCurrentChunkId(NARRATION_CHUNKS[0].id);
      setIsPresentationStarted(true);
      setPromptModal(null);
      await initialAudioStart;
    } catch (error) {
      stopNarrationAudio();
      setUiError(error instanceof Error ? error.message : "Could not start the presentation.");
    } finally {
      setIsPreparing(false);
    }
  }

  function primeInitialNarrationPlayback(options: { reportError: boolean }) {
    if (!initialNarrationStartPromiseRef.current) {
      initialNarrationStartPromiseRef.current = playNarrationChunk(NARRATION_CHUNKS[0], options)
        .finally(() => {
          initialNarrationStartPromiseRef.current = null;
        });
    }
    return initialNarrationStartPromiseRef.current;
  }

  function stopNarrationAudio() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    activeNarrationAudioUrlRef.current = null;
    setIsNarratorPaused(true);
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

    const nextSubtitle = getNarrationCaption(currentChunk, elapsed, duration, SUBTITLE_LEAD_SECONDS);
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
    if (ENABLE_BETWEEN_SLIDE_PROMPTS && gate && !answeredGateIds.includes(gate.id)) {
      showGate(gate);
      return;
    }
    playNextChunk();
  }

  function setVideoAmbientVolume(volume: number) {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.volume = Math.max(0, Math.min(1, volume));
    video.muted = volume <= 0;
  }

  function playBackgroundVideoFromGesture() {
    const video = videoRef.current;
    if (!video) {
      return Promise.resolve();
    }
    configureBackgroundVideo(video, true);
    return video.play().then(() => undefined);
  }

  function handleBackgroundVideoEnded() {
    setBackgroundVideoIndex((previous) => (
      backgroundVideos.length > 1 ? (previous + 1) % backgroundVideos.length : previous
    ));
    if (backgroundVideos.length <= 1) {
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
    }
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
    setNarratorSubtitle(getNarrationCaption(nextChunk, 0, nextChunk.durationSeconds, SUBTITLE_LEAD_SECONDS));
    setCurrentChunkId(nextChunk.id);
  }

  function handlePromptSubmit(answer: string) {
    if (!promptModal) {
      return;
    }
    const gateId = promptModal.id;
    setAnsweredGateIds((previous) => (
      previous.includes(gateId) ? previous : [...previous, gateId]
    ));
    setPromptModal(null);
    setBotTtsTranscript(`Noted: ${answer}`);

    const action = getPromptAnswerAction(gateId, answer);
    if (action === "show_trial_cta") {
      const trialVisual = imagesRef.current.find((image) => image.id === "trial-stay");
      if (trialVisual) {
        setVisual((previous) => ({ ...trialVisual, videoUrl: previous.videoUrl }));
      }
      setIsNarratorPaused(true);
      return;
    }
    if (action === "open_updates") {
      setIsNarratorPaused(true);
      openSubscribeFlow();
      return;
    }
    if (action === "replay_membership") {
      setCurrentChunkId("membership_structure");
      return;
    }
    if (action === "soft_close") {
      setCurrentChunkId("decision_close");
      return;
    }

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

  function openFaqModal(faq: PreparedFaq = PREPARED_FAQS[0]) {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      setIsNarratorPaused(true);
    }
    setUiError(null);
    setActiveFaqId(faq.id);
  }

  function closeFaqModal() {
    stopFaqReading();
    setActiveFaqId(null);
  }

  function stopFaqReading() {
    const faqAudio = faqAudioRef.current;
    if (faqAudio) {
      faqAudio.pause();
      faqAudio.currentTime = 0;
    }
    setIsFaqReading(false);
  }

  function playFaqAnswer(faq: PreparedFaq) {
    const faqAudio = faqAudioRef.current;
    if (!faqAudio) {
      setUiError("FAQ audio is not ready yet. You can still read the answer here.");
      return;
    }
    faqAudio.pause();
    faqAudio.src = faq.audioUrl;
    faqAudio.currentTime = 0;
    setIsFaqReading(true);
    void faqAudio.play().catch(() => {
      setIsFaqReading(false);
      setUiError("FAQ audio could not play in this browser session. You can still read the answer here.");
    });
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
        void submitSubscribeLead(next);
      } else {
        setSubscribeStep(nextStep);
      }
      return next;
    });
  }

  async function submitSubscribeLead(lead: SubscribeForm) {
    setSubscribeError("");
    try {
      const response = await fetch("/api/subscribe-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as Record<string, unknown>));
        throw new Error(String(data.error || "Could not save this update request."));
      }
      window.localStorage.setItem(SUBSCRIBE_LEAD_STORAGE_KEY, JSON.stringify({
        ...lead,
        capturedAt: new Date().toISOString(),
      }));
      setSubscribeStep(SUBSCRIBE_QUESTIONS.length + 1);
    } catch (error) {
      setSubscribeError(error instanceof Error ? error.message : "Could not save this update request.");
    }
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
    const video = videoRef.current;
    if (audio.paused) {
      setIsNarratorPaused(false);
      void audio.play().catch((error) => {
        if (isInterruptedMediaPlayError(error)) {
          return;
        }
        setIsNarratorPaused(true);
        setUiError(error instanceof Error ? error.message : "Could not resume narration audio.");
      });
      void video?.play().catch(() => undefined);
    } else {
      audio.pause();
      video?.pause();
      setIsNarratorPaused(true);
    }
  }

  function pauseWalkthroughMedia() {
    audioRef.current?.pause();
    videoRef.current?.pause();
    setIsNarratorPaused(true);
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
    void audio.play().catch((error) => {
      if (isInterruptedMediaPlayError(error)) {
        return;
      }
      setIsNarratorPaused(true);
    });
  }

  async function startAmbientBed() {
    if (ambientRef.current) {
      await ambientRef.current.context.resume().catch(() => undefined);
      setAmbientGain(AMBIENT_GAIN);
      return;
    }
    if (ambientStartPromiseRef.current) {
      await ambientStartPromiseRef.current;
      setAmbientGain(AMBIENT_GAIN);
      return;
    }

    ambientStartPromiseRef.current = (async () => {
      const context = new AudioContext({ sampleRate: 24000 });
      if (context.state === "suspended") {
        await context.resume();
      }

      const masterGain = context.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(context.destination);

      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 130;

      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 850;

      const streamGain = context.createGain();
      streamGain.gain.value = 0.72;

      const bufferLength = context.sampleRate * 4;
      const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
      const channel = buffer.getChannelData(0);
      let previous = 0;
      for (let index = 0; index < bufferLength; index += 1) {
        const white = Math.random() * 2 - 1;
        previous = (previous + 0.018 * white) / 1.018;
        channel[index] = previous * 2.8;
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(streamGain);
      streamGain.connect(masterGain);
      source.start();

      ambientRef.current = {
        context,
        masterGain,
        source,
        chirpTimeout: null,
      };
      scheduleAmbientChirp();
      setAmbientGain(AMBIENT_GAIN);
    })().finally(() => {
      ambientStartPromiseRef.current = null;
    });

    await ambientStartPromiseRef.current;
  }

  function setAmbientGain(gain: number) {
    const ambient = ambientRef.current;
    if (!ambient) {
      return;
    }
    const now = ambient.context.currentTime;
    ambient.masterGain.gain.cancelScheduledValues(now);
    ambient.masterGain.gain.setTargetAtTime(gain, now, 0.8);
  }

  function scheduleAmbientChirp() {
    const ambient = ambientRef.current;
    if (!ambient) {
      return;
    }
    const delay = 5500 + Math.random() * 8500;
    ambient.chirpTimeout = window.setTimeout(() => {
      playAmbientChirp();
      scheduleAmbientChirp();
    }, delay);
  }

  function playAmbientChirp() {
    const ambient = ambientRef.current;
    if (!ambient || ambient.context.state === "closed") {
      return;
    }
    const now = ambient.context.currentTime;
    const chirps = Math.random() > 0.55 ? 2 : 1;
    for (let index = 0; index < chirps; index += 1) {
      const offset = index * (0.13 + Math.random() * 0.08);
      const oscillator = ambient.context.createOscillator();
      const gain = ambient.context.createGain();
      const start = now + offset;
      const end = start + 0.09 + Math.random() * 0.07;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1900 + Math.random() * 1200, start);
      oscillator.frequency.exponentialRampToValueAtTime(2600 + Math.random() * 1800, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.011, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(ambient.masterGain);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
  }

  function stopAmbientBed() {
    const ambient = ambientRef.current;
    ambientRef.current = null;
    if (!ambient) {
      return;
    }
    if (ambient.chirpTimeout) {
      window.clearTimeout(ambient.chirpTimeout);
    }
    try {
      ambient.source.stop();
    } catch {
      // Already stopped.
    }
    void ambient.context.close();
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

  function startLocalSpeechPreview() {
    const SpeechRecognition = getBrowserSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";
      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index]?.[0]?.transcript?.trim();
          if (!transcript) {
            continue;
          }
          if (event.results[index].isFinal) {
            localSpeechFinalRef.current = `${localSpeechFinalRef.current} ${transcript}`.trim();
          } else {
            interim = `${interim} ${transcript}`.trim();
          }
        }
        const preview = `${localSpeechFinalRef.current} ${interim}`.trim();
        if (preview) {
          userTranscriptRef.current = preview;
          setUserTranscript(preview);
        }
      };
      recognition.onerror = () => undefined;
      recognition.onend = () => {
        if (localSpeechRecognitionRef.current === recognition) {
          localSpeechRecognitionRef.current = null;
        }
      };
      recognition.start();
      localSpeechRecognitionRef.current = recognition;
    } catch {
      localSpeechRecognitionRef.current = null;
    }
  }

  function stopLocalSpeechPreview() {
    const recognition = localSpeechRecognitionRef.current;
    localSpeechRecognitionRef.current = null;
    if (!recognition) {
      return;
    }
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // Browser speech recognition may already be stopped.
    }
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

  function closeLiveSession() {
    void sessionRef.current?.close?.();
    sessionRef.current = null;
    liveConnectPromiseRef.current = null;
    liveSocketOpenRef.current = false;
  }

  function closeLiveSessionSoon() {
    window.setTimeout(closeLiveSession, 120);
  }

  function recoverFromLiveFailure(message = "Gemini Live is temporarily unavailable. Returning to the walkthrough.") {
    stopRecorder();
    stopLivePlayback();
    stopLocalSpeechPreview();
    clearAnswerTimeout();
    clearLiveAnswerResumeTimeout();
    closeLiveSession();
    liveQuestionActiveRef.current = false;
    setLivePhase("unavailable");
    setUiError(message);
    window.setTimeout(resumeNarratorAfterLive, 180);
  }

  function returnToWalkthrough() {
    stopRecorder();
    stopLivePlayback();
    stopLocalSpeechPreview();
    clearAnswerTimeout();
    clearLiveAnswerResumeTimeout();
    closeLiveSession();
    liveQuestionActiveRef.current = false;
    setLivePhase("idle");
    setUiError(null);
    resumeNarratorAfterLive();
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
        recoverFromLiveFailure("I could not catch the question clearly. Returning to the walkthrough.");
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
        recoverFromLiveFailure("Gemini Live did not answer this question. Returning to the walkthrough.");
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
            recoverFromLiveFailure(getLiveConnectionError(event));
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
    localSpeechFinalRef.current = "";
    pendingBotTranscriptRef.current = "";
    fullBotTranscriptRef.current = "";
    setBotTtsTranscript("");
    setLiveAnswerText("");

    const openedStreams: MediaStream[] = [];
    let pendingSessionPromise: Promise<Session> | null = null;
    let micContext: AudioContext | null = null;
    try {
      micContext = new AudioContext({ sampleRate: 16000 });
      const micContextReady = micContext.state === "suspended"
        ? micContext.resume()
        : Promise.resolve();
      const outputContextReady = ensureOutputAudioContext().catch(() => undefined);
      const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        openedStreams.push(stream);
        return stream;
      });
      const sessionPromise = ensureLiveSession();
      pendingSessionPromise = sessionPromise;
      const [session, stream] = await Promise.all([sessionPromise, streamPromise]);
      await Promise.all([micContextReady, outputContextReady]);
      pauseNarratorForMic();
      const context = micContext;
      micContext = null;
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
            recoverFromLiveFailure("The live mic connection dropped. Returning to the walkthrough.");
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
            recoverFromLiveFailure("The live mic connection dropped. Returning to the walkthrough.");
          }
        };
        recorderRef.current.processor = processor;
        source.connect(processor);
        processor.connect(gain);
      }

      setIsMicOpen(true);
      setLivePhase("listening");
      startLocalSpeechPreview();
    } catch (error) {
      openedStreams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      void micContext?.close().catch(() => undefined);
      void pendingSessionPromise?.then((session) => session.close()).catch(() => undefined);
      recoverFromLiveFailure(getLiveConnectionError(error));
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
      stopLocalSpeechPreview();
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
      recoverFromLiveFailure("The live mic closed before the question could be sent. Returning to the walkthrough.");
    }
  }

  function handlePrimaryAction() {
    if (!isPresentationStarted) {
      void handleStartPresentation();
      return;
    }
    if (livePhase === "answering") {
      returnToWalkthrough();
      return;
    }
    if (isMicOpen) {
      void handleCloseMic();
      return;
    }
    void handleOpenMic();
  }

  function handlePrimaryPointerDown() {
    if (!isPresentationStarted && canUsePrimaryAction) {
      void primeInitialNarrationPlayback({ reportError: false }).catch(() => undefined);
      void startAmbientBed().catch(() => undefined);
      void playBackgroundVideoFromGesture().catch(() => undefined);
    }
  }

  const actionLabel = isPreparing || livePhase === "connecting"
    ? "Opening"
    : livePhase === "answering"
      ? "Return to walkthrough"
    : !isPresentationStarted
      ? "Begin walkthrough"
      : isMicOpen
        ? "Send question"
        : "Ask a question";
  const micHint = isPresentationStarted
    ? isMicOpen
      ? hasCapturedQuestion
        ? "Question captured. Tap send when complete."
        : "Speak now. Tap send when your question is complete."
      : "Tap the mic to pause the narrator and ask one question."
    : "The presentation starts from committed audio, so there is no live wait at the beginning.";

  const livePanelTitle = livePhase === "answering" || liveAnswerText
    ? "Response"
    : isMicOpen
      ? hasCapturedQuestion
        ? "Question captured"
        : "Speak now"
      : "Preparing mic";
  const livePanelText = livePhase === "answering" || liveAnswerText
    ? liveAnswerText || botTtsTranscript || "Answering now..."
    : hasCapturedQuestion
      ? "Tap send when your question is complete. The guide will answer briefly and return to the walkthrough."
      : "Ask your question naturally. When you are done, tap the send icon so the guide can answer and return to the walkthrough.";

  function renderSubtitle(text: string) {
    return text;
  }

  function renderTrackedNarrationSubtitle() {
    return narratorSubtitle || getNarrationCaption(
      currentChunk,
      narratorElapsedSeconds,
      currentChunk.durationSeconds,
      SUBTITLE_LEAD_SECONDS,
    );
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
      <audio
        ref={faqAudioRef}
        preload="metadata"
        onEnded={() => setIsFaqReading(false)}
        onPause={() => setIsFaqReading(false)}
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
          muted={!isPresentationStarted}
          playsInline
          onEnded={handleBackgroundVideoEnded}
        >
          <source src={activeBackgroundVideoUrl} type="video/mp4" />
        </video>

        <div className="beforest-story__scrim" aria-hidden="true" />

        <div className="beforest-story__overlay">
          <header key={currentChunk.id} className="beforest-heading" aria-live="polite">
            <p className="beforest-heading__kicker">{guideStage}</p>
            <h1 className="beforest-heading__title">{visual.hook}</h1>
          </header>

          {shouldShowDecisionCta ? (
            <button
              type="button"
              className="beforest-faq-trigger"
              onClick={() => openFaqModal()}
              aria-label="Open prepared 10 percent questions"
            >
              FAQ
            </button>
          ) : null}

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
                  onPointerDown={handlePrimaryPointerDown}
                  onClick={handlePrimaryAction}
                  disabled={!canUsePrimaryAction}
                  aria-label={actionLabel}
                  aria-pressed={isMicOpen}
                >
                  <span className="beforest-mic-button__ring" aria-hidden="true" />
                  <span className="beforest-mic-button__surface">
                    {isPreparing || livePhase === "connecting" ? (
                      <LoaderCircle size={24} className="spin" />
                    ) : livePhase === "answering" ? (
                      <Play size={24} />
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

                {isPresentationStarted && !isLiveFocus ? (
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
                <a
                  className="beforest-cta-button"
                  href={TRIAL_STAY_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={pauseWalkthroughMedia}
                >
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
                ) : isSubscribeComplete ? (
                  <>
                    <p className="beforest-question-eyebrow">Updates / Received</p>
                    <h2 id="beforest-subscribe-title">Thank you. We have got your update request.</h2>
                    <p className="beforest-question-context">
                      Beforest will use these details to send you the most relevant next note. No new tab, no redirect.
                    </p>
                    <div className="beforest-question-actions beforest-subscribe-actions">
                      <button type="button" className="beforest-subscribe-next" onClick={closeSubscribeFlow}>
                        Close
                      </button>
                    </div>
                  </>
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

          {activeFaq ? (
            <div className="beforest-question-backdrop beforest-faq-backdrop" role="presentation">
              <section
                className="beforest-question-modal beforest-faq-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="beforest-faq-title"
              >
                <div className="beforest-faq-modal__top">
                  <div>
                    <p className="beforest-question-eyebrow">Prepared FAQ</p>
                    <h2 id="beforest-faq-title">Questions from The Founding Silence</h2>
                  </div>
                  <button type="button" className="beforest-faq-close" onClick={closeFaqModal}>
                    Close
                  </button>
                </div>

                <div className="beforest-faq-layout">
                  <div className="beforest-faq-list" aria-label="FAQ questions">
                    {PREPARED_FAQS.map((faq) => (
                      <button
                        key={faq.id}
                        type="button"
                        className={faq.id === activeFaq.id ? "is-active" : ""}
                        onClick={() => {
                          stopFaqReading();
                          setActiveFaqId(faq.id);
                        }}
                      >
                        {faq.question}
                      </button>
                    ))}
                  </div>
                  <article className="beforest-faq-answer">
                    <div className="beforest-faq-answer__header">
                      <span>Selected question</span>
                      <h3>{activeFaq.question}</h3>
                    </div>
                    <div className="beforest-faq-answer__scroll">
                      <p>{activeFaq.answer}</p>
                    </div>
                    <div className="beforest-faq-answer__footer">
                      <button
                        type="button"
                        className="beforest-faq-play"
                        onClick={() => isFaqReading ? stopFaqReading() : playFaqAnswer(activeFaq)}
                      >
                        {isFaqReading ? "Stop audio" : "Play answer"}
                      </button>
                      <span>{isFaqReading ? "Narrator audio playing" : "Same voice as walkthrough"}</span>
                    </div>
                  </article>
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
