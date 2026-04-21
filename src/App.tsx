import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { ArrowUpRight, Microphone, Question, X } from '@phosphor-icons/react';
import {
  createPcmPlayer,
  createPcmRecorder,
  type AudioPlayerHandle,
  type RecorderHandle,
} from './audio';

type ConnectionState = 'connecting' | 'ready' | 'error';
type TurnKind = 'narration' | 'question' | null;
type LiveTurnState =
  | 'idle'
  | 'starting'
  | 'narrating'
  | 'draining'
  | 'listening'
  | 'answering'
  | 'resuming'
  | 'error';
type LiveSessionEventType =
  | 'session_opened'
  | 'session_error'
  | 'session_closed'
  | 'begin_clicked'
  | 'playback_unlock_attempted'
  | 'playback_unlock_succeeded'
  | 'playback_unlock_failed'
  | 'narration_requested'
  | 'question_requested'
  | 'first_output_transcript'
  | 'first_audio_chunk'
  | 'first_audio_timeout'
  | 'narration_retry'
  | 'generation_complete'
  | 'turn_complete'
  | 'recording_started'
  | 'recording_stopped'
  | 'interrupted'
  | 'slide_advanced'
  | 'voice_changed';

interface PresentationSlide {
  id: string;
  title: string;
  note: string;
  script: string;
  imageUrl: string;
  ctaLabel?: string;
  ctaHref?: string;
  kind?: 'scene' | 'quote' | 'cta' | 'derived';
}

interface PresentationPayload {
  title: string;
  slides: PresentationSlide[];
}

interface QuestionRouteResponse {
  action: 'stay' | 'goto' | 'derived';
  targetSlideId: string | null;
  derivedTitle: string | null;
  derivedNote: string | null;
  imageFromSlideId: string | null;
}

interface LiveSessionEvent {
  id: number;
  at: string;
  type: LiveSessionEventType;
  slideId: string | null;
  turnState: LiveTurnState;
  detail: string;
}

const VOICE_OPTIONS = ['Zephyr', 'Sulafat', 'Algieba', 'Schedar', 'Achird', 'Kore'] as const;
const PRE_BEGIN_HOOK = '30 nights a year where recovery becomes real.';
const PRE_BEGIN_NOTE =
  'A quiet walkthrough of protection, rhythm, and return, told one scene at a time.';

function getOptimizedImageUrl(
  imageUrl: string,
  options: { width: number; height: number; quality: number },
) {
  if (!imageUrl.includes('/storage/v1/object/public/')) {
    return imageUrl;
  }

  const transformedBase = imageUrl.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  );
  const url = new URL(transformedBase);

  url.searchParams.set('width', String(options.width));
  url.searchParams.set('height', String(options.height));
  url.searchParams.set('quality', String(options.quality));
  url.searchParams.set('resize', 'cover');

  return url.toString();
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function mergeOutputTranscriptSnapshot(previousText: string, nextText: string) {
  const previous = previousText.replace(/\s+/g, ' ').trim();
  const next = nextText.replace(/\s+/g, ' ').trim();

  if (!next) {
    return previous;
  }

  if (!previous) {
    return next;
  }

  if (next === previous || previous.startsWith(next)) {
    return previous;
  }

  if (next.startsWith(previous)) {
    return next;
  }

  const previousWords = previous.split(/\s+/).filter(Boolean);
  const nextWords = next.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(previousWords.length, nextWords.length);

  for (let overlap = maxOverlap; overlap >= 3; overlap -= 1) {
    const previousTail = previousWords.slice(-overlap).join(' ');
    const nextHead = nextWords.slice(0, overlap).join(' ');

    if (previousTail === nextHead) {
      return `${previousWords.join(' ')} ${nextWords.slice(overlap).join(' ')}`.trim();
    }
  }

  return `${previous} ${next}`.replace(/\s+/g, ' ').trim();
}

function buildLiveCaption(transcript: string, previousCaption = '') {
  const text = transcript.replace(/\s+/g, ' ').trim();

  if (!text) {
    return '';
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const hasCompletedEnding = /[.!?]["']?$/.test(text);
  const completeSentences = hasCompletedEnding ? sentences : sentences.slice(0, -1);
  const trailingSentence = hasCompletedEnding ? '' : sentences.at(-1)?.trim() ?? '';

  if (completeSentences.length >= 2) {
    const combined = completeSentences.slice(-2).join(' ').trim();
    if (combined.length <= 188 && countWords(combined) <= 30) {
      return combined;
    }
  }

  const lastSentence = completeSentences.at(-1)?.trim();
  if (lastSentence) {
    return lastSentence;
  }

  if (trailingSentence) {
    const trailingWords = trailingSentence.split(/\s+/).filter(Boolean);
    if (trailingWords.length < 4) {
      return previousCaption;
    }

    const clippedTrailing =
      trailingWords.length > 18
        ? trailingWords.slice(trailingWords.length - 18).join(' ')
        : trailingSentence;

    if (
      previousCaption &&
      clippedTrailing.startsWith(previousCaption) &&
      clippedTrailing.length - previousCaption.length < 16
    ) {
      return previousCaption;
    }

    return clippedTrailing;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) {
    return previousCaption;
  }

  const fallback = words.length > 18 ? words.slice(words.length - 18).join(' ') : text;
  if (
    previousCaption &&
    fallback.startsWith(previousCaption) &&
    fallback.length - previousCaption.length < 16
  ) {
    return previousCaption;
  }

  return fallback;
}

function isSystemCaptionLabel(text: string) {
  return /^(Beforest is speaking|Beforest is responding|Listening|Switching to|Moving to slide|Question answered\.)/i.test(
    text.trim(),
  );
}

function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [connectionError, setConnectionError] = useState('');
  const [authEnabled, setAuthEnabled] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isActivated, setIsActivated] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSwitchingVoice, setIsSwitchingVoice] = useState(false);
  const [presentationTitle, setPresentationTitle] = useState('The 10% Life');
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [liveTurnState, setLiveTurnState] = useState<LiveTurnState>('idle');
  const [liveEvents, setLiveEvents] = useState<LiveSessionEvent[]>([]);
  const [latestOutputTranscript, setLatestOutputTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<(typeof VOICE_OPTIONS)[number]>('Zephyr');
  const [displaySubtitle, setDisplaySubtitle] = useState('');
  const [isSubtitleVisible, setIsSubtitleVisible] = useState(false);
  const [uiError, setUiError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const outputTranscriptTimeoutRef = useRef<number | null>(null);
  const autoAdvanceTimeoutRef = useRef<number | null>(null);
  const questionCommandTimeoutRef = useRef<number | null>(null);
  const turnCompletionFallbackTimeoutRef = useRef<number | null>(null);
  const pendingTranscriptRef = useRef('');
  const queuedOutputTranscriptRef = useRef('');
  const outputTranscriptIsFinalRef = useRef(false);
  const isRecordingRef = useRef(false);
  const hasNarratedSlideRef = useRef<number | null>(null);
  const selectedVoiceRef = useRef<(typeof VOICE_OPTIONS)[number]>('Zephyr');
  const suppressNextCloseErrorRef = useRef(false);
  const currentTurnKindRef = useRef<TurnKind>(null);
  const slidesRef = useRef<PresentationSlide[]>([]);
  const currentSlideIndexRef = useRef(0);
  const isActivatedRef = useRef(false);
  const handledQuestionTranscriptRef = useRef('');
  const captionTimeoutRef = useRef<number | null>(null);
  const liveTurnStateRef = useRef<LiveTurnState>('idle');
  const liveEventIdRef = useRef(0);
  const startupAudioTimeoutRef = useRef<number | null>(null);
  const activeNarrationTurnIdRef = useRef(0);
  const firstAudioChunkReceivedRef = useRef(false);
  const firstOutputTranscriptReceivedRef = useRef(false);
  const previousSlideIndexRef = useRef(0);
  const narrationRetryCountRef = useRef(0);

  const isMobile = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const isDebugMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.has('debug') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  }, []);
  const currentSlide = slides[currentSlideIndex] ?? null;
  const slideVisuals = useMemo(
    () =>
      slides.map((slide) => ({
        id: slide.id,
        imageUrl: getOptimizedImageUrl(slide.imageUrl, {
          width: isMobile ? 900 : 1080,
          height: isMobile ? 1600 : 1920,
          quality: isMobile ? 70 : 76,
        }),
      })),
    [isMobile, slides],
  );
  const sceneEyebrow = presentationTitle;
  const sceneHeading = isActivated ? currentSlide?.title ?? PRE_BEGIN_HOOK : PRE_BEGIN_HOOK;
  const sceneNote = isActivated ? currentSlide?.note ?? PRE_BEGIN_NOTE : PRE_BEGIN_NOTE;

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    for (const { imageUrl } of slideVisuals) {
      const image = new window.Image();
      image.src = imageUrl;
    }
  }, [slideVisuals]);

  useEffect(() => {
    currentSlideIndexRef.current = currentSlideIndex;
    narrationRetryCountRef.current = 0;
  }, [currentSlideIndex]);

  useEffect(() => {
    isActivatedRef.current = isActivated;
  }, [isActivated]);

  useEffect(() => {
    if (!isActivated) {
      previousSlideIndexRef.current = currentSlideIndex;
      return;
    }

    if (previousSlideIndexRef.current !== currentSlideIndex) {
      logLiveEvent('slide_advanced', `Slide ${previousSlideIndexRef.current + 1} -> ${currentSlideIndex + 1}`);
    }

    previousSlideIndexRef.current = currentSlideIndex;
  }, [currentSlideIndex, isActivated]);

  function setLiveTurnStateValue(nextState: LiveTurnState) {
    liveTurnStateRef.current = nextState;
    setLiveTurnState(nextState);
  }

  function logLiveEvent(type: LiveSessionEventType, detail: string) {
    const nextEvent: LiveSessionEvent = {
      id: liveEventIdRef.current += 1,
      at: new Date().toISOString(),
      type,
      slideId: slidesRef.current[currentSlideIndexRef.current]?.id ?? null,
      turnState: liveTurnStateRef.current,
      detail,
    };

    setLiveEvents((previous) => [...previous.slice(-39), nextEvent]);
  }

  function clearStartupAudioTimeout() {
    if (startupAudioTimeoutRef.current !== null) {
      window.clearTimeout(startupAudioTimeoutRef.current);
      startupAudioTimeoutRef.current = null;
    }
  }

  async function retryCurrentNarrationStartup() {
    const slideIndex = currentSlideIndexRef.current;
    const slide = slidesRef.current[slideIndex];
    if (!slide || !isActivatedRef.current) {
      return;
    }

    narrationRetryCountRef.current += 1;
    setConnectionState('connecting');
    setConnectionError('');
    setUiError('Voice stalled. Retrying this scene...');
    setLiveTurnStateValue('starting');
    logLiveEvent('narration_retry', `Retrying narration for slide ${slideIndex + 1}.`);

    try {
      suppressNextCloseErrorRef.current = true;
      sessionRef.current?.close();
      sessionRef.current = null;
      await playerRef.current?.dispose();
      playerRef.current = null;
      await openLiveSession(selectedVoiceRef.current);
      await unlockAudioPlayback({ required: true, reason: 'narration retry' });

      if (!isActivatedRef.current || currentSlideIndexRef.current !== slideIndex) {
        return;
      }

      hasNarratedSlideRef.current = slideIndex;
      narrateSlide(slideIndex);
    } catch (error) {
      setConnectionState('error');
      setConnectionError(error instanceof Error ? error.message : 'Unable to retry narration.');
      setUiError('Voice could not restart. Switch the voice or refresh the session.');
      setLiveTurnStateValue('error');
    }
  }

  function beginNarrationTracking() {
    activeNarrationTurnIdRef.current += 1;
    firstAudioChunkReceivedRef.current = false;
    firstOutputTranscriptReceivedRef.current = false;
    clearStartupAudioTimeout();

    const turnId = activeNarrationTurnIdRef.current;
    startupAudioTimeoutRef.current = window.setTimeout(() => {
      if (
        currentTurnKindRef.current === 'narration' &&
        activeNarrationTurnIdRef.current === turnId &&
        !firstAudioChunkReceivedRef.current
      ) {
        logLiveEvent('first_audio_timeout', 'No audio chunk arrived within 6 seconds of narration request.');
        if (narrationRetryCountRef.current < 1) {
          void retryCurrentNarrationStartup();
          return;
        }

        setLiveTurnStateValue('error');
        setUiError('Voice did not start. Try switching the voice or refreshing the session.');
      }
    }, 6000);
  }

  useEffect(() => {
    let nextSubtitle = displaySubtitle;

    if (latestOutputTranscript.trim()) {
      const liveCaption = buildLiveCaption(latestOutputTranscript, displaySubtitle);
      if (liveCaption) {
        nextSubtitle = liveCaption;
      }
    } else if (isRecording) {
      nextSubtitle = liveTranscript.trim() || 'Listening...';
    } else if (!isActivated) {
      nextSubtitle = '';
    } else if (liveTranscript.trim() && !isSystemCaptionLabel(liveTranscript.trim())) {
      nextSubtitle = liveTranscript.trim();
    }

    if (captionTimeoutRef.current !== null) {
      window.clearTimeout(captionTimeoutRef.current);
      captionTimeoutRef.current = null;
    }

    const bufferedMs = playerRef.current?.getBufferedMs() ?? 0;
    const delayMs = latestOutputTranscript.trim()
      ? Math.max(320, Math.min(1100, Math.round(bufferedMs * 0.16 + 360)))
      : 0;
    captionTimeoutRef.current = window.setTimeout(() => {
      setDisplaySubtitle(nextSubtitle);
      setIsSubtitleVisible(Boolean(nextSubtitle));
      captionTimeoutRef.current = null;
    }, delayMs);

    return () => {
      if (captionTimeoutRef.current !== null) {
        window.clearTimeout(captionTimeoutRef.current);
        captionTimeoutRef.current = null;
      }
    };
  }, [displaySubtitle, isActivated, isRecording, latestOutputTranscript, liveTranscript]);

  function clearTranscriptQueue() {
    if (outputTranscriptTimeoutRef.current !== null) {
      window.clearTimeout(outputTranscriptTimeoutRef.current);
      outputTranscriptTimeoutRef.current = null;
    }
    queuedOutputTranscriptRef.current = '';
    outputTranscriptIsFinalRef.current = false;
    firstOutputTranscriptReceivedRef.current = false;
  }

  function flushQueuedOutputTranscript() {
    if (outputTranscriptTimeoutRef.current !== null) {
      window.clearTimeout(outputTranscriptTimeoutRef.current);
      outputTranscriptTimeoutRef.current = null;
    }

    const queuedTranscript = queuedOutputTranscriptRef.current.trim();
    if (!queuedTranscript) {
      return;
    }

    queuedOutputTranscriptRef.current = '';
    setLatestOutputTranscript((previous) =>
      mergeOutputTranscriptSnapshot(previous, queuedTranscript),
    );
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
  }

  function clearQuestionCommandTimeout() {
    if (questionCommandTimeoutRef.current !== null) {
      window.clearTimeout(questionCommandTimeoutRef.current);
      questionCommandTimeoutRef.current = null;
    }
  }

  function clearTurnCompletionFallback() {
    if (turnCompletionFallbackTimeoutRef.current !== null) {
      window.clearTimeout(turnCompletionFallbackTimeoutRef.current);
      turnCompletionFallbackTimeoutRef.current = null;
    }
  }

  function getTranscriptFlushDelayMs(options?: { final?: boolean }) {
    const bufferedMs = playerRef.current?.getBufferedMs() ?? 0;

    if (options?.final) {
      return Math.max(900, Math.min(2800, Math.round(bufferedMs * 1.04 + 520)));
    }

    return Math.max(1500, Math.min(3800, Math.round(bufferedMs * 1.2 + 920)));
  }

  function scheduleOutputTranscriptFlush(options?: { final?: boolean }) {
    if (!queuedOutputTranscriptRef.current.trim()) {
      return;
    }

    if (outputTranscriptTimeoutRef.current !== null) {
      window.clearTimeout(outputTranscriptTimeoutRef.current);
      outputTranscriptTimeoutRef.current = null;
    }

    const delayMs = getTranscriptFlushDelayMs(options);
    outputTranscriptTimeoutRef.current = window.setTimeout(() => {
      flushQueuedOutputTranscript();
    }, delayMs);
  }

  function scheduleNarrationCompletionFallback() {
    if (currentTurnKindRef.current !== 'narration') {
      return;
    }

    clearTurnCompletionFallback();
    const bufferedMs = playerRef.current?.getBufferedMs() ?? 0;
    const current = slidesRef.current[currentSlideIndexRef.current];
    const settleMs = current?.kind === 'quote' ? 1700 : 2300;
    const delayMs = Math.max(settleMs, Math.round(bufferedMs + settleMs));

    turnCompletionFallbackTimeoutRef.current = window.setTimeout(() => {
      if (currentTurnKindRef.current === 'narration') {
        handleTurnComplete();
      }
    }, delayMs);
  }

  function resetTurnUi(label: string) {
    pendingTranscriptRef.current = '';
    handledQuestionTranscriptRef.current = '';
    outputTranscriptIsFinalRef.current = false;
    firstAudioChunkReceivedRef.current = false;
    clearStartupAudioTimeout();
    setLiveTranscript(label);
    setLatestOutputTranscript('');
    playerRef.current?.reset();
    clearTranscriptQueue();
    clearAutoAdvance();
    clearQuestionCommandTimeout();
    clearTurnCompletionFallback();
  }

  function interruptCurrentTurn() {
    playerRef.current?.reset();
    clearTranscriptQueue();
    clearAutoAdvance();
    clearTurnCompletionFallback();
    clearStartupAudioTimeout();
    currentTurnKindRef.current = null;
  }

  function parseNavigationCommand(transcript: string) {
    const normalized = transcript.toLowerCase().trim();
    if (!normalized) {
      return null;
    }

    const numberWords: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };

    const parseSlideNumber = () => {
      const digitMatch = normalized.match(/slide\s+(\d+)/);
      if (digitMatch) {
        return Number(digitMatch[1]);
      }

      const wordMatch = normalized.match(
        /slide\s+(one|two|three|four|five|six|seven|eight|nine|ten)/,
      );
      if (wordMatch) {
        return numberWords[wordMatch[1]];
      }

      return null;
    };

    if (
      /(go back|go to previous|previous slide|previous one|back to slide|take me back|show me slide)/.test(
        normalized,
      )
    ) {
      const slideNumber = parseSlideNumber();
      if (slideNumber !== null) {
        return Math.max(0, Math.min(slidesRef.current.length - 1, slideNumber - 1));
      }
      return Math.max(0, currentSlideIndexRef.current - 1);
    }

    if (/(go to slide|take me to slide|jump to slide|show slide)/.test(normalized)) {
      const slideNumber = parseSlideNumber();
      if (slideNumber !== null) {
        return Math.max(0, Math.min(slidesRef.current.length - 1, slideNumber - 1));
      }
    }

    if (/(next slide|go next|move ahead|continue)/.test(normalized)) {
      return Math.min(slidesRef.current.length - 1, currentSlideIndexRef.current + 1);
    }

    if (/(first slide|start over|go to the beginning)/.test(normalized)) {
      return 0;
    }

    if (/(last slide|final slide|cta slide)/.test(normalized)) {
      return Math.max(0, slidesRef.current.length - 1);
    }

    return null;
  }

  function applyNavigationCommand(targetIndex: number) {
    interruptCurrentTurn();
    hasNarratedSlideRef.current = null;
    setLiveTurnStateValue('resuming');
    setCurrentSlideIndex(targetIndex);
    setLiveTranscript(`Moving to slide ${targetIndex + 1}.`);
    setLatestOutputTranscript('');
    handledQuestionTranscriptRef.current = pendingTranscriptRef.current;
  }

  function maybeHandleQuestionCommand(transcript: string) {
    if (currentTurnKindRef.current !== 'question') {
      return false;
    }

    if (!transcript.trim() || handledQuestionTranscriptRef.current === transcript) {
      return false;
    }

    const targetIndex = parseNavigationCommand(transcript);
    if (targetIndex === null || Number.isNaN(targetIndex)) {
      return false;
    }

    applyNavigationCommand(targetIndex);
    return true;
  }

  function shouldRouteQuestion(question: string) {
    const normalized = question.toLowerCase().trim();
    if (!normalized) {
      return false;
    }

    return /(go to|take me to|jump to|show me slide|slide\s+\d+|slide\s+(one|two|three|four|five|six|seven|eight|nine|ten)|make a slide|create a slide|new slide|another slide|dedicated slide|compare this with|show this differently)/.test(
      normalized,
    );
  }

  async function openLiveSession(
    voiceName: (typeof VOICE_OPTIONS)[number],
    options?: { loadPresentation?: boolean },
  ) {
    const query = new URLSearchParams({ voiceName });
    const tokenResponse = await fetch(`/api/live-token?${query.toString()}`);
    if (!tokenResponse.ok) {
      throw new Error('Live token request failed.');
    }

    const { token, model } = (await tokenResponse.json()) as {
      token: string;
      model: string;
      voiceName: string;
    };

    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: true,
          },
        },
      },
      callbacks: {
        onopen: () => {
          setConnectionState('ready');
          setIsSwitchingVoice(false);
          setLiveTurnStateValue('idle');
          logLiveEvent('session_opened', `Live session ready with ${voiceName}.`);
        },
        onmessage: (message: LiveServerMessage) => {
          handleMessage(message);
        },
        onerror: (event: ErrorEvent) => {
          setConnectionState('error');
          setIsSwitchingVoice(false);
          setConnectionError(event.message);
          setLiveTurnStateValue('error');
          clearStartupAudioTimeout();
          logLiveEvent('session_error', event.message || 'Unknown session error.');
        },
        onclose: (event: CloseEvent) => {
          if (suppressNextCloseErrorRef.current) {
            suppressNextCloseErrorRef.current = false;
            return;
          }
          setConnectionState('error');
          setIsSwitchingVoice(false);
          setConnectionError(
            event.reason
              ? `Live session closed: ${event.reason}`
              : `Live session closed (${event.code}).`,
          );
          setLiveTurnStateValue('error');
          clearStartupAudioTimeout();
          logLiveEvent(
            'session_closed',
            event.reason ? event.reason : `Session closed (${event.code}).`,
          );
        },
      },
    });

    sessionRef.current = session;

    if (options?.loadPresentation) {
      const presentationResponse = await fetch('/api/presentation');
      if (!presentationResponse.ok) {
        throw new Error('Presentation request failed.');
      }

      const presentation = (await presentationResponse.json()) as PresentationPayload;
      setPresentationTitle(presentation.title);
      setSlides(presentation.slides);
      currentSlideIndexRef.current = 0;
    }
  }

  useEffect(() => {
    let disposed = false;

    async function bootstrap() {
      try {
        const authResponse = await fetch('/api/auth/status');
        if (!authResponse.ok) {
          throw new Error('Auth status request failed.');
        }

        const auth = (await authResponse.json()) as {
          authenticated: boolean;
          enabled: boolean;
        };

        if (disposed) {
          return;
        }

        setAuthEnabled(auth.enabled);
        setIsAuthenticated(auth.authenticated || !auth.enabled);

        if (auth.enabled && !auth.authenticated) {
          setConnectionState('ready');
          return;
        }

        await openLiveSession(selectedVoiceRef.current, { loadPresentation: true });
      } catch (error) {
        if (disposed) {
          return;
        }
        setConnectionState('error');
        setConnectionError(error instanceof Error ? error.message : 'Unable to connect.');
        setLiveTurnStateValue('error');
      }
    }

    bootstrap();

    return () => {
      disposed = true;
      clearTranscriptQueue();
      clearAutoAdvance();
      clearQuestionCommandTimeout();
      clearStartupAudioTimeout();
      sessionRef.current?.close();
      recorderRef.current?.dispose().catch(() => undefined);
      playerRef.current?.dispose().catch(() => undefined);
    };
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAuthorizing(true);
    setAuthError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      if (!response.ok) {
        throw new Error('Invalid passcode.');
      }

      setIsAuthenticated(true);
      setPasscode('');
      setConnectionState('connecting');
      setConnectionError('');
      await openLiveSession(selectedVoiceRef.current, { loadPresentation: true });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to unlock.');
      setConnectionState('ready');
    } finally {
      setIsAuthorizing(false);
    }
  }

  useEffect(() => {
    if (!isActivated || connectionState !== 'ready' || !currentSlide || !sessionRef.current) {
      return;
    }

    kickoffCurrentSlideNarration();
  }, [connectionState, currentSlide, currentSlideIndex, isActivated]);

  function buildNarrationPrompt(slide: PresentationSlide, slideIndex: number, totalSlides: number) {
    const position = `Internal context: scene ${slideIndex + 1} of ${totalSlides}.`;
    const scene = `Internal reference only. Title: "${slide.title}". Note: "${slide.note}". Approved spoken context: "${slide.script}".`;
    const openingFramework =
      slideIndex === 0
        ? 'Open as if someone just asked you, "So what exactly is Beforest?" Answer directly and naturally, without saying hello, welcome, or giving a formal agenda. In the first few lines, make three things clear in everyday language: what Beforest is, why it matters, and where this conversation is going. Use contractions. Keep the sentences short. Sound warm, thoughtful, and lightly informal, like a smart person explaining something clearly on a call. Speak a little slower than usual, with clean pauses between ideas, so the listener can settle into the pace. Do not explain controls, clicking, microphones, or app behavior unless the listener asks. After that orientation, move naturally into the substance.'
        : '';
    const interruptionNudge =
      slide.kind !== 'cta' && (slideIndex === 0 || slideIndex % 3 === 2)
        ? 'If it feels natural, add one brief line that they can interrupt you with the mic anytime and you will keep going unless they do.'
        : '';
    const close =
      slide.kind === 'cta'
        ? 'Close with conviction, invite them to take the trial stay at hospitality.beforest.co, and end with: You decide with your feet, not your eyes. See you in the slow lane.'
        : 'Close naturally. Keep the story moving on its own. Do not wait for audience input.';

    return `${position} ${scene} Speak for about 22 to 32 seconds. This is for internal guidance only: never say slide, scene, presentation, or "in this part". Never describe what is on the slide. Never say "this slide is about" or anything similar. Do not open with "hello", "welcome", "today I want to share", or other presentation language. Speak like a human guide on a thoughtful call, not a brochure or voice-over. Keep the pace calm and measured. Let each idea land before the next one. ${openingFramework} ${interruptionNudge} ${close}`;
  }

  function sendTextTurn(text: string, kind: TurnKind) {
    if (!sessionRef.current || !text.trim()) {
      return;
    }

    currentTurnKindRef.current = kind;
    resetTurnUi(kind === 'narration' ? 'Beforest is speaking...' : 'Beforest is responding...');
    if (kind === 'narration') {
      setLiveTurnStateValue('starting');
      logLiveEvent(
        'narration_requested',
        slidesRef.current[currentSlideIndexRef.current]
          ? `Narrating ${slidesRef.current[currentSlideIndexRef.current]?.title}.`
          : 'Narration requested.',
      );
      beginNarrationTracking();
    } else if (kind === 'question') {
      setLiveTurnStateValue('answering');
      logLiveEvent(
        'question_requested',
        text.length > 120 ? `${text.slice(0, 117)}...` : text,
      );
    }
    sessionRef.current.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      turnComplete: true,
    });
  }

  function narrateSlide(slideIndex: number) {
    const slide = slidesRef.current[slideIndex];
    if (!slide) {
      return;
    }

    sendTextTurn(buildNarrationPrompt(slide, slideIndex, slidesRef.current.length), 'narration');
  }

  function scheduleNextSlide(delayMs = 2200) {
    clearAutoAdvance();
    if (currentSlideIndexRef.current >= slidesRef.current.length - 1) {
      setLiveTurnStateValue('idle');
      return;
    }

    autoAdvanceTimeoutRef.current = window.setTimeout(() => {
      setCurrentSlideIndex((previous) => previous + 1);
    }, delayMs);
  }

  function scheduleNextSlideAfterPlayback() {
    clearAutoAdvance();
    if (currentSlideIndexRef.current >= slidesRef.current.length - 1) {
      setLiveTurnStateValue('idle');
      return;
    }

    setLiveTurnStateValue('draining');

    const startedAt = performance.now();

    const waitForDrain = () => {
      const bufferedMs = playerRef.current?.getBufferedMs() ?? 0;
      const elapsedMs = performance.now() - startedAt;
      const drained = bufferedMs <= 180;
      const timedOut = elapsedMs >= 12_000;

      if (drained || timedOut) {
        setLiveTurnStateValue('resuming');
        scheduleNextSlide(900);
        return;
      }

      autoAdvanceTimeoutRef.current = window.setTimeout(waitForDrain, 180);
    };

    waitForDrain();
  }

  function continueAfterQuestion(delayMs = 1400) {
    clearAutoAdvance();
    if (currentSlideIndexRef.current >= slidesRef.current.length - 1) {
      setLiveTurnStateValue('idle');
      return;
    }

    setLiveTurnStateValue('resuming');
    const startedAt = performance.now();

    const waitForDrain = () => {
      const bufferedMs = playerRef.current?.getBufferedMs() ?? 0;
      const elapsedMs = performance.now() - startedAt;
      const drained = bufferedMs <= 180;
      const timedOut = elapsedMs >= 12_000;

      if (drained || timedOut) {
        autoAdvanceTimeoutRef.current = window.setTimeout(() => {
          setCurrentSlideIndex((previous) => previous + 1);
        }, delayMs);
        return;
      }

      autoAdvanceTimeoutRef.current = window.setTimeout(waitForDrain, 180);
    };

    waitForDrain();
  }

  async function applyQuestionRouting(question: string) {
    if (!question.trim()) {
      continueAfterQuestion(1600);
      return;
    }

    try {
      const response = await fetch('/api/question-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          currentSlideId: slidesRef.current[currentSlideIndexRef.current]?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Question route failed.');
      }

      const route = (await response.json()) as QuestionRouteResponse;

      if (route.action === 'goto' && route.targetSlideId) {
        const targetIndex = slidesRef.current.findIndex((slide) => slide.id === route.targetSlideId);
        if (targetIndex >= 0) {
          hasNarratedSlideRef.current = null;
          setCurrentSlideIndex(targetIndex);
          return;
        }
      }

      if (route.action === 'derived' && route.derivedTitle && route.derivedNote) {
        const imageSource = slidesRef.current.find(
          (slide) => slide.id === route.imageFromSlideId,
        ) ?? slidesRef.current[currentSlideIndexRef.current];

        const derivedSlide: PresentationSlide = {
          id: `derived-${Date.now()}`,
          title: route.derivedTitle,
          note: route.derivedNote,
          script: route.derivedNote,
          imageUrl: imageSource?.imageUrl ?? slidesRef.current[currentSlideIndexRef.current]?.imageUrl ?? '',
          kind: 'derived',
        };

        setSlides((previous) => {
          const insertAt = currentSlideIndexRef.current + 1;
          const next = [...previous];
          next.splice(insertAt, 0, derivedSlide);
          return next;
        });
        hasNarratedSlideRef.current = null;
        setCurrentSlideIndex(currentSlideIndexRef.current + 1);
        return;
      }

      if (route.action === 'stay') {
        setLiveTranscript('Question answered. Continuing.');
        continueAfterQuestion();
        return;
      }
    } catch {
      setLiveTranscript('Question answered. Continuing.');
      continueAfterQuestion();
      return;
    }

    setLiveTranscript('Question answered. Continuing.');
    continueAfterQuestion();
  }

  function handleTurnComplete() {
    const turnKind = currentTurnKindRef.current;
    currentTurnKindRef.current = null;
    clearTurnCompletionFallback();
    logLiveEvent('turn_complete', turnKind ? `${turnKind} turn completed.` : 'Turn completed.');
    if (turnKind === 'narration') {
      if (currentSlideIndexRef.current < slidesRef.current.length - 1) {
        scheduleNextSlideAfterPlayback();
      } else {
        setLiveTurnStateValue('idle');
      }
      return;
    }

    if (turnKind === 'question') {
      const question = pendingTranscriptRef.current.trim();
      pendingTranscriptRef.current = '';
      const targetIndex = parseNavigationCommand(question);
      if (targetIndex !== null && !Number.isNaN(targetIndex)) {
        setLiveTurnStateValue('resuming');
        applyNavigationCommand(targetIndex);
        return;
      }
      if (!shouldRouteQuestion(question)) {
        setLiveTranscript('Question answered. Continuing.');
        continueAfterQuestion();
        return;
      }
      void applyQuestionRouting(question);
    }
  }

  function handleMessage(message: LiveServerMessage) {
    const serverContent = message.serverContent;
    const parts = serverContent?.modelTurn?.parts ?? [];

    for (const part of parts) {
      if (
        part.inlineData?.data &&
        typeof part.inlineData.mimeType === 'string' &&
        part.inlineData.mimeType.startsWith('audio/pcm')
      ) {
        if (!firstAudioChunkReceivedRef.current) {
          firstAudioChunkReceivedRef.current = true;
          narrationRetryCountRef.current = 0;
          clearStartupAudioTimeout();
          setUiError((previous) =>
            previous.startsWith('Voice did not start') || previous.startsWith('Voice stalled')
              ? ''
              : previous,
          );
          if (currentTurnKindRef.current === 'narration') {
            setLiveTurnStateValue('narrating');
          } else if (currentTurnKindRef.current === 'question') {
            setLiveTurnStateValue('answering');
          }
          logLiveEvent(
            'first_audio_chunk',
            currentTurnKindRef.current === 'narration'
              ? 'First narration audio chunk received.'
              : 'First response audio chunk received.',
          );
        }
        if (!playerRef.current) {
          playerRef.current = createPcmPlayer();
        }
        void playerRef.current.enqueue(part.inlineData.data);
      }
    }

    const transcript = serverContent?.inputTranscription?.text;
    if (transcript) {
      pendingTranscriptRef.current = transcript;
      setLiveTranscript(transcript);
      if (!isRecordingRef.current) {
        clearQuestionCommandTimeout();
        questionCommandTimeoutRef.current = window.setTimeout(() => {
          maybeHandleQuestionCommand(pendingTranscriptRef.current);
        }, 250);
      }
    }

    const outputTranscript = serverContent?.outputTranscription?.text;
    if (outputTranscript) {
      if (!firstOutputTranscriptReceivedRef.current) {
        firstOutputTranscriptReceivedRef.current = true;
        logLiveEvent(
          'first_output_transcript',
          outputTranscript.length > 120 ? `${outputTranscript.slice(0, 117)}...` : outputTranscript,
        );
      }
      queuedOutputTranscriptRef.current = mergeOutputTranscriptSnapshot(
        queuedOutputTranscriptRef.current,
        outputTranscript,
      );
      scheduleOutputTranscriptFlush({ final: outputTranscriptIsFinalRef.current });
    }

    if (serverContent?.interrupted) {
      playerRef.current?.reset();
      clearTranscriptQueue();
      clearAutoAdvance();
      clearTurnCompletionFallback();
      clearStartupAudioTimeout();
      logLiveEvent('interrupted', 'Model output was interrupted.');
    }

    if (serverContent?.generationComplete) {
      outputTranscriptIsFinalRef.current = true;
      scheduleOutputTranscriptFlush({ final: true });
      if (currentTurnKindRef.current === 'narration') {
        setLiveTurnStateValue('draining');
      }
      logLiveEvent('generation_complete', 'Model generation finished.');
      scheduleNarrationCompletionFallback();
    }

    if (serverContent?.turnComplete) {
      outputTranscriptIsFinalRef.current = true;
      scheduleOutputTranscriptFlush({ final: true });
      handleTurnComplete();
    }
  }

  async function unlockAudioPlayback(options?: { required?: boolean; reason?: string }) {
    if (!playerRef.current) {
      playerRef.current = createPcmPlayer();
    }

    logLiveEvent(
      'playback_unlock_attempted',
      `Unlock requested for ${options?.reason ?? 'general playback'}.`,
    );

    try {
      await playerRef.current.prepare();
      logLiveEvent(
        'playback_unlock_succeeded',
        `Playback unlocked for ${options?.reason ?? 'general playback'}.`,
      );
      return true;
    } catch (error) {
      logLiveEvent(
        'playback_unlock_failed',
        error instanceof Error
          ? error.message
          : `Playback unlock failed for ${options?.reason ?? 'general playback'}.`,
      );
      if (options?.required) {
        throw error;
      }

      return false;
    }
  }

  function kickoffCurrentSlideNarration(options?: { force?: boolean }) {
    const slideIndex = currentSlideIndexRef.current;
    const slide = slidesRef.current[slideIndex];

    if (!sessionRef.current || connectionState !== 'ready' || !isActivatedRef.current || !slide) {
      return false;
    }

    if (!options?.force && hasNarratedSlideRef.current === slideIndex) {
      return false;
    }

    hasNarratedSlideRef.current = slideIndex;
    narrateSlide(slideIndex);
    return true;
  }

  async function activatePresentation() {
    if (isActivatedRef.current) {
      return;
    }

    if (!slidesRef.current.length || !slidesRef.current[currentSlideIndexRef.current]) {
      throw new Error('Presentation is still loading. Please wait a moment and try again.');
    }

    await unlockAudioPlayback({ required: true, reason: 'begin' });
    isActivatedRef.current = true;
    setIsActivated(true);
    hasNarratedSlideRef.current = null;
    narrationRetryCountRef.current = 0;
  }

  async function startRecording() {
    const session = sessionRef.current;
    if (!session || isRecordingRef.current) {
      return;
    }

    if (!isActivatedRef.current) {
      return;
    } else {
      await unlockAudioPlayback({ required: true, reason: 'question recording' });
    }

    clearAutoAdvance();
    currentTurnKindRef.current = 'question';
    setLiveTurnStateValue('listening');
    resetTurnUi('Listening...');

    try {
      const recorder = createPcmRecorder((base64Chunk) => {
        session.sendRealtimeInput({
          audio: {
            data: base64Chunk,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      });

      recorderRef.current = recorder;
      session.sendRealtimeInput({ activityStart: {} });
      await recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      setUiError('');
      logLiveEvent('recording_started', 'Microphone capture started.');
    } catch (error) {
      setUiError(error instanceof Error ? error.message : 'Microphone access failed.');
      currentTurnKindRef.current = null;
      setLiveTranscript('');
      setLiveTurnStateValue('error');
    }
  }

  async function stopRecording() {
    if (!isRecordingRef.current) {
      return;
    }

    await recorderRef.current?.stop();
    sessionRef.current?.sendRealtimeInput({ activityEnd: {} });
    isRecordingRef.current = false;
    setIsRecording(false);
    setLiveTurnStateValue('answering');
    logLiveEvent('recording_stopped', 'Microphone capture stopped; waiting for answer.');
    clearQuestionCommandTimeout();
    questionCommandTimeoutRef.current = window.setTimeout(() => {
      maybeHandleQuestionCommand(pendingTranscriptRef.current);
    }, 500);
  }

  async function reconnectWithVoice(nextVoice: (typeof VOICE_OPTIONS)[number]) {
    if (selectedVoiceRef.current === nextVoice || isRecordingRef.current) {
      return;
    }

    setSelectedVoice(nextVoice);
    selectedVoiceRef.current = nextVoice;
    setIsSwitchingVoice(true);
    setConnectionState('connecting');
    setConnectionError('');
    hasNarratedSlideRef.current = null;
    resetTurnUi(`Switching to ${nextVoice}...`);
    setLiveTurnStateValue('starting');
    logLiveEvent('voice_changed', `Switching voice to ${nextVoice}.`);
    suppressNextCloseErrorRef.current = true;
    sessionRef.current?.close();

    try {
      await playerRef.current?.dispose();
      playerRef.current = null;
      await unlockAudioPlayback({ reason: 'voice switch' });
      await openLiveSession(nextVoice);
    } catch (error) {
      setConnectionState('error');
      setIsSwitchingVoice(false);
      setConnectionError(error instanceof Error ? error.message : 'Unable to switch voice.');
      setLiveTurnStateValue('error');
    }
  }

  useEffect(() => {
    if (isMobile) {
      return;
    }

    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName.toLowerCase();
      return (
        target.isContentEditable ||
        ['input', 'textarea', 'select', 'button', 'a'].includes(tagName)
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.code !== 'Space' || event.repeat) {
          return;
        }
        if (isInteractiveTarget(event.target)) {
          return;
        }
        if (!isActivatedRef.current) {
          return;
        }
        event.preventDefault();
        void startRecording();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      if (isInteractiveTarget(event.target)) {
        return;
      }
      event.preventDefault();
      void stopRecording();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMobile]);

  if (authEnabled && !isAuthenticated) {
    return (
      <main className="shell auth-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />

        <section className="auth-card">
          <p className="eyebrow">Beforest Access</p>
          <h1 className="auth-title">Enter passcode</h1>
          <p className="auth-copy">
            This presentation is protected. Enter the passcode to unlock the live guide.
          </p>

          <form className="auth-form" onSubmit={(event) => void handleLogin(event)}>
            <label htmlFor="passcode">Passcode</label>
            <input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="Enter passcode"
              autoComplete="current-password"
            />
            <button type="submit" className="continue-button cta-button" disabled={isAuthorizing || !passcode.trim()}>
              <span>{isAuthorizing ? 'Unlocking...' : 'Unlock presentation'}</span>
              <ArrowUpRight size={18} />
            </button>
          </form>

          {authError ? <p className="auth-error">{authError}</p> : null}
        </section>
      </main>
    );
  }

  function handleMicClick() {
    if (!isActivated) {
      return;
    }
  }

  function handleMicPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!isActivated || connectionState !== 'ready') {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    void startRecording();
  }

  function handleMicPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (!isActivated) {
      return;
    }

    event.preventDefault();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    void stopRecording();
  }

  async function handleBegin() {
    if (isStarting || connectionState !== 'ready' || !currentSlide) {
      return;
    }

    setIsStarting(true);
    setUiError('');
    setLiveTurnStateValue('starting');
    logLiveEvent('begin_clicked', 'Begin pressed.');

    try {
      await activatePresentation();
      kickoffCurrentSlideNarration({ force: true });
    } catch (error) {
      setUiError(
        error instanceof Error ? error.message : 'Unable to begin the presentation.',
      );
      setLiveTurnStateValue('error');
    } finally {
      setIsStarting(false);
    }
  }

  function handleMicPointerCancel(event: React.PointerEvent<HTMLButtonElement>) {
    if (!isActivated) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    void stopRecording();
  }

  return (
    <main className="shell portrait-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <section className="portrait-player" aria-label={presentationTitle}>
        <div className="scene-stack" aria-live="off">
          {slideVisuals.map(({ id, imageUrl }, index) => (
            <figure
              key={id}
              className={`scene-layer motion-${index % 3}${index === currentSlideIndex ? ' active' : ''}`}
              aria-hidden={index !== currentSlideIndex}
            >
              <img src={imageUrl} alt="" />
            </figure>
          ))}
        </div>

        <div className="portrait-overlay">
          <div className={`topic-heading${isActivated ? '' : ' idle'}`} aria-live="polite">
            <p className="topic-eyebrow">{sceneEyebrow}</p>
            <h1 className="topic-title">{sceneHeading}</h1>
            <p className="topic-note">{sceneNote}</p>
          </div>

          <div className="voice-corner">
            <label className="sr-only" htmlFor="voice-select">
              Voice
            </label>
            <button
              type="button"
              className={`status-dot status-${connectionState}`}
              aria-label={`Connection status: ${connectionState}`}
              title={connectionState}
            />
            <select
              id="voice-select"
              value={selectedVoice}
              onChange={(event) =>
                void reconnectWithVoice(event.target.value as (typeof VOICE_OPTIONS)[number])
              }
              disabled={connectionState === 'connecting' || isRecording || isSwitchingVoice}
            >
              {VOICE_OPTIONS.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </div>

          {isActivated ? (
            <div className="mic-stage">
              <button
                type="button"
                className={`center-mic${isRecording ? ' active' : ''}`}
                aria-label={
                  isRecording ? 'Release to ask a question' : 'Hold to ask a question'
                }
                onClick={handleMicClick}
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={handleMicPointerCancel}
                disabled={connectionState !== 'ready' || isSwitchingVoice}
              >
                <Microphone size={24} weight="fill" />
              </button>
            </div>
          ) : null}

          <div className="subtitle-rail">
            <p
              className={`subtitle-line${displaySubtitle && isSubtitleVisible ? ' visible' : ''}`}
              aria-live="polite"
            >
              {displaySubtitle}
            </p>
            {isActivated && currentSlide?.ctaHref ? (
              <a
                className="cta-chip"
                href={currentSlide.ctaHref}
                target="_blank"
                rel="noreferrer"
              >
                <span>{currentSlide.ctaLabel ?? 'Start your trial'}</span>
                <ArrowUpRight size={14} />
              </a>
            ) : null}
          </div>

          {connectionState === 'error' || uiError ? (
            <div className="inline-error" role="alert">
              {uiError || connectionError}
            </div>
          ) : null}

          {!isActivated ? (
            <div className="begin-control">
              <button
                type="button"
                className="begin-button"
                onClick={() => void handleBegin()}
                disabled={connectionState !== 'ready' || isStarting || !currentSlide}
              >
                <span>
                  {isStarting ? 'Starting...' : currentSlide ? 'Begin' : 'Loading...'}
                </span>
                <ArrowUpRight size={16} />
              </button>
            </div>
          ) : null}

          {isActivated ? (
            <button
              type="button"
              className="help-button"
              aria-label="Open presentation help"
              onClick={() => setIsHelpOpen(true)}
            >
              <Question size={16} weight="bold" />
            </button>
          ) : null}

          {isDebugMode ? (
            <>
              <button
                type="button"
                className="debug-toggle"
                aria-label={isDebugPanelOpen ? 'Hide live debug panel' : 'Show live debug panel'}
                onClick={() => setIsDebugPanelOpen((previous) => !previous)}
              >
                Debug
              </button>
              {isDebugPanelOpen ? (
                <aside className="debug-panel" aria-label="Live debug panel">
                  <div className="debug-panel-header">
                    <div>
                      <p className="debug-panel-kicker">Live Trace</p>
                      <strong>{liveTurnState}</strong>
                    </div>
                    <button
                      type="button"
                      className="debug-panel-close"
                      aria-label="Close live debug panel"
                      onClick={() => setIsDebugPanelOpen(false)}
                    >
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                  <div className="debug-panel-meta">
                    <span>{connectionState}</span>
                    <span>{currentSlide ? `Slide ${currentSlideIndex + 1}` : 'No slide'}</span>
                    <span>{currentTurnKindRef.current ?? 'no turn'}</span>
                  </div>
                  <div className="debug-event-list">
                    {liveEvents.length ? (
                      [...liveEvents].reverse().map((event) => (
                        <article key={event.id} className="debug-event-item">
                          <div className="debug-event-meta">
                            <span>{event.at.slice(11, 19)}</span>
                            <span>{event.type}</span>
                          </div>
                          <p>{event.detail}</p>
                        </article>
                      ))
                    ) : (
                      <p className="debug-event-empty">No live events yet.</p>
                    )}
                  </div>
                </aside>
              ) : null}
            </>
          ) : null}

          {isHelpOpen ? (
            <div className="help-modal-backdrop" role="presentation" onClick={() => setIsHelpOpen(false)}>
              <section
                className="help-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="help-title"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="help-close"
                  aria-label="Close help"
                  onClick={() => setIsHelpOpen(false)}
                >
                  <X size={16} weight="bold" />
                </button>
                <p className="help-kicker">Beforest Guide</p>
                <h2 id="help-title">A short, guided walkthrough.</h2>
                <p className="help-copy">
                  It moves on its own, you can interrupt with a question at any point, and the
                  final scene offers the next step when the story gets there.
                </p>
                <div className="help-grid">
                  <div>
                    <strong>Runtime</strong>
                    <span>Usually 4 to 6 minutes.</span>
                  </div>
                  <div>
                    <strong>Questions</strong>
                    <span>Press and hold the mic to interrupt, ask, and let it continue.</span>
                  </div>
                  <div>
                    <strong>Voice</strong>
                    <span>Switch narrators from the top control.</span>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          <div className="screen-frame" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}

export default App;
