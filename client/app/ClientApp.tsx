"use client";

import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { LoaderCircle, Mic, Pause, Play, Send } from "lucide-react";
import Image from "next/image";
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
};

type GeminiToken = {
  name: string;
  newSessionExpireTime: string;
  expireTime: string;
  fetchedAt: number;
};

type LivePhase = "idle" | "connecting" | "listening" | "answering" | "unavailable";

type RecorderState = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  gain: GainNode;
  hasSpeech: boolean;
};

type PromptModal = {
  id: string;
  question: string;
  context: string;
  suggestedAnswers: string[];
};

const LISTENER_NAME_STORAGE_KEY = "beforest_listener_name";
const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const DEFAULT_VOICE_ID = "Gacrux";
const FOUNDING_SILENCE_URL = "https://10percent.beforest.co/the-founding-silence";
const TRIAL_STAY_URL = "https://hospitality.beforest.co";
const GEMINI_TOKEN_REFRESH_BUFFER_MS = 10_000;

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
  const [uiError, setUiError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const liveConnectPromiseRef = useRef<Promise<Session> | null>(null);
  const liveSocketOpenRef = useRef(false);
  const recorderRef = useRef<RecorderState | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const activeLiveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextLivePlaybackTimeRef = useRef(0);
  const answerTimeoutRef = useRef<number | null>(null);
  const pendingBotTranscriptRef = useRef("");
  const shouldResumeNarratorRef = useRef(false);
  const imagesRef = useRef<BeforestVisual[]>([]);
  const knowledgeRef = useRef<KnowledgeChunk[]>([]);

  const currentChunk = getNarrationChunk(currentChunkId);
  const isAccessReady = Boolean(accessState?.authorized && listenerName.trim() && hasConfirmedListener);
  const shouldShowNameForm = Boolean(accessState && !hasConfirmedListener);
  const shouldShowAccessForm = Boolean(accessState && (!accessState.authorized || shouldShowNameForm));
  const isLiveBusy = livePhase === "connecting" || livePhase === "answering";
  const canUsePrimaryAction = isAccessReady && !isPreparing && !promptModal && !isLiveBusy;

  const guideStage = isPresentationStarted ? currentChunk.stageLabel : "Beforest 10% Life";
  const connectionLabel = useMemo(() => {
    if (!isAccessReady) {
      return "Awaiting entry";
    }
    if (!isPresentationStarted) {
      return "Ready to play";
    }
    if (livePhase === "connecting") {
      return "Opening live mic";
    }
    if (livePhase === "listening") {
      return "Listening";
    }
    if (livePhase === "answering") {
      return "Answering";
    }
    if (livePhase === "unavailable") {
      return "Live unavailable";
    }
    return isNarratorPaused ? "Narrator paused" : "Narration playing";
  }, [isAccessReady, isNarratorPaused, isPresentationStarted, livePhase]);

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
      clearAnswerTimeout();
    };
  }, []);

  useEffect(() => {
    const sectionVisual = imagesRef.current.find((image) => image.id === currentChunk.visualId);
    if (sectionVisual) {
      setVisual(sectionVisual);
    }
  }, [currentChunk.visualId]);

  useEffect(() => {
    if (!isPresentationStarted || promptModal) {
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.src = currentChunk.audioUrl;
    audio.currentTime = 0;
    setNarratorElapsedSeconds(0);
    setNarratorSubtitle(buildTranscriptWindow(currentChunk.transcript, 0, currentChunk.durationSeconds));
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

  async function ensureGeminiToken(runtimeContext?: string) {
    if (!runtimeContext && geminiToken && Date.parse(geminiToken.newSessionExpireTime) - Date.now() > GEMINI_TOKEN_REFRESH_BUFFER_MS) {
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
      ...((await response.json()) as Omit<GeminiToken, "fetchedAt">),
      fetchedAt: Date.now(),
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
    setNarratorElapsedSeconds(elapsed);
    setNarratorSubtitle(buildTranscriptWindow(currentChunk.transcript, elapsed, duration));
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
    shouldResumeNarratorRef.current = false;
    const audio = audioRef.current;
    if (!audio || !isPresentationStarted) {
      return;
    }
    if (currentChunk.resumeMode === "restart_chunk") {
      audio.currentTime = 0;
    }
    setBotTtsTranscript("");
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

  function scheduleAnswerFallback() {
    clearAnswerTimeout();
    answerTimeoutRef.current = window.setTimeout(() => {
      answerTimeoutRef.current = null;
      if (!liveSocketOpenRef.current || !sessionRef.current || activeLiveSourcesRef.current.size) {
        return;
      }
      const question = userTranscript.trim();
      try {
        sessionRef.current.sendClientContent({
          turns: [{
            role: "user",
            parts: [{
              text: [
                "The listener just asked a question during the paused presentation.",
                question ? `Live transcript: ${question}` : "Use the spoken question you just received.",
                buildLiveTelemetryPrompt(currentChunk),
                "Answer briefly, then hand back to the narrator with the return line.",
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
        if (livePhase === "answering") {
          window.setTimeout(resumeNarratorAfterLive, 650);
        }
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
        setUserTranscript(text);
      }
    }
    if (message.serverContent?.outputTranscription?.text) {
      clearAnswerTimeout();
      const text = message.serverContent.outputTranscription.text.trim();
      if (text) {
        pendingBotTranscriptRef.current = mergeRollingWords(pendingBotTranscriptRef.current, text, 16);
        setBotTtsTranscript(pendingBotTranscriptRef.current);
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
        window.setTimeout(resumeNarratorAfterLive, 900);
      }
      window.setTimeout(() => {
        void sessionRef.current?.close?.();
        sessionRef.current = null;
        liveConnectPromiseRef.current = null;
        if (!activeLiveSourcesRef.current.size) {
          setLivePhase("idle");
        }
      }, 1500);
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
    setBotTtsTranscript("");
    const promise = (async () => {
      const token = await ensureGeminiToken(buildLiveTelemetryPrompt(currentChunk));
      const ai = new GoogleGenAI({ apiKey: token.name, apiVersion: "v1alpha" });
      let markLiveOpen: (() => void) | null = null;
      const liveOpenPromise = new Promise<void>((resolve) => {
        markLiveOpen = resolve;
      });
      const liveSession = await ai.live.connect({
        model: MODEL,
        callbacks: {
          onopen: () => {
            liveSocketOpenRef.current = true;
            markLiveOpen?.();
            setLivePhase("listening");
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
            window.setTimeout(resumeNarratorAfterLive, 300);
          },
          onclose: () => {
            liveSocketOpenRef.current = false;
            sessionRef.current = null;
            liveConnectPromiseRef.current = null;
            stopRecorder();
            clearAnswerTimeout();
            setLivePhase((phase) => phase === "answering" && activeLiveSourcesRef.current.size ? phase : "idle");
            if (!activeLiveSourcesRef.current.size) {
              window.setTimeout(resumeNarratorAfterLive, 300);
            }
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
        },
      });
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
    pauseNarratorForMic();
    setUiError(null);
    setUserTranscript("");
    setBotTtsTranscript("");

    try {
      const session = await ensureLiveSession();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext({ sampleRate: 16000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const gain = context.createGain();
      gain.gain.value = 0;
      recorderRef.current = { stream, context, source, processor, gain, hasSpeech: false };

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
            audio: {
              data: bytesToBase64(new Uint8Array(pcm16.buffer)),
              mimeType: `audio/pcm;rate=${context.sampleRate}`,
            },
          });
        } catch {
          stopRecorder();
          setLivePhase("unavailable");
        }
      };

      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      if (liveSocketOpenRef.current) {
        session.sendRealtimeInput({ activityStart: {} });
      }
      setIsMicOpen(true);
      setLivePhase("listening");
    } catch (error) {
      setLivePhase("unavailable");
      setUiError(error instanceof Error ? error.message : "Microphone access failed.");
      stopRecorder();
      clearAnswerTimeout();
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
      recorder.processor.disconnect();
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
    if (!recorder?.hasSpeech) {
      if (liveSocketOpenRef.current) {
        sessionRef.current?.sendRealtimeInput({ activityEnd: {} });
      }
      setLivePhase("idle");
      resumeNarratorAfterLive();
      return;
    }
    setLivePhase("answering");
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
        ? "Close question"
        : "Ask a question";
  const micHint = isPresentationStarted
    ? isMicOpen
      ? "Tap again when you are done. The narrator will resume after the answer."
      : "The narrator keeps control. Use the mic only when you want to interrupt."
    : "The presentation starts from committed audio, so there is no live wait at the beginning.";

  return (
    <main className="beforest-shell">
      <div className="beforest-noise" aria-hidden="true" />
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={handleNarratorTimeUpdate}
        onEnded={handleNarratorEnded}
      />

      <section className="beforest-story" aria-label="Beforest controlled walkthrough">
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
            <p className={`beforest-status beforest-status--${livePhase === "idle" ? "live_ready" : livePhase}`}>
              {connectionLabel}
            </p>

            {uiError ? (
              <p className="beforest-inline-error" role="alert">
                {uiError}
              </p>
            ) : null}

            <p className={`beforest-subtitle${displayedSubtitle ? " visible" : ""}`} aria-live="polite">
              {displayedSubtitle}
            </p>

            {!shouldShowAccessForm ? (
              <div className="beforest-action-row">
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
                  >
                    {isNarratorPaused ? <Play size={18} /> : <Pause size={18} />}
                    {isNarratorPaused ? "Resume" : "Pause"}
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

            {showDecisionCta ? (
              <div className="beforest-cta-card">
                <p className="beforest-cta-eyebrow">Choose the right next step</p>
                <h2 className="beforest-cta-title">The land will explain this more clearly than a pitch.</h2>
                <a className="beforest-cta-button" href={TRIAL_STAY_URL} target="_blank" rel="noreferrer">
                  Take a trial stay
                </a>
                <a className="beforest-cta-button secondary" href={FOUNDING_SILENCE_URL} target="_blank" rel="noreferrer">
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

          <div className="beforest-screen-frame" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
};
