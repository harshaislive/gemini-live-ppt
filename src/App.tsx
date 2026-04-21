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

const VOICE_OPTIONS = ['Zephyr', 'Sulafat', 'Algieba', 'Schedar', 'Achird', 'Kore'] as const;

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

  return `${previous} ${next}`.replace(/\s+/g, ' ').trim();
}

function buildSubtitleCue(transcript: string) {
  const text = transcript.replace(/\s+/g, ' ').trim();
  const totalWords = countWords(text);

  if (!text) {
    return { text: '', totalWords: 0, mode: 'empty' as const };
  }

  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lastPart = parts.at(-1) ?? '';
  const hasCompletedEnding = /[.!?]["']?$/.test(text);
  const tail = hasCompletedEnding ? '' : lastPart;
  const complete = tail ? parts.slice(0, -1) : parts;

  if (tail) {
    const tailWords = countWords(tail);
    if (tailWords >= 7) {
      const tailWordsList = tail.split(/\s+/).filter(Boolean);
      return {
        text: tailWordsList.length > 16 ? tailWordsList.slice(-16).join(' ') : tail,
        totalWords,
        mode: 'tail' as const,
      };
    }
  }

  if (complete.length > 0) {
    let cue = complete.at(-1) ?? '';
    if (complete.length >= 2) {
      const combined = `${complete.at(-2)} ${cue}`.trim();
      if (combined.length <= 150 && countWords(combined) <= 20) {
        cue = combined;
      }
    }

    return { text: cue, totalWords, mode: 'sentence' as const };
  }

  const words = text.split(/\s+/).filter(Boolean);
  return {
    text: words.length > 14 ? words.slice(-14).join(' ') : text,
    totalWords,
    mode: 'tail' as const,
  };
}

function buildTopicSequence(slide: PresentationSlide | null) {
  if (!slide) {
    return ['Guided conversation'];
  }

  const curatedTopics: Record<string, string[]> = {
    'slide-01': ['When Life Stays Full', 'Recovery Is Maintenance'],
    'slide-02': ['A Life That Still Hurts'],
    'slide-03': ['30 Nights a Year', 'Protected Time, Not Escape'],
    'slide-04': ['7 Years on the Land', '1,300 Acres Restored'],
    'slide-05': ['Rest Is a Rhythm'],
    'slide-06': ['Where Recovery Gets Real', 'Places You Can Return To'],
    'slide-07': ['30 Nights/Year for 10 Years', 'Access Changes Behaviour'],
    'slide-08': ['Decide With Your Feet'],
    'slide-09': ['The Cost of Waiting', 'Another Year Unchanged'],
    'slide-10': ['Start With a Trial Stay', 'Experience Before Commitment'],
  };

  if (curatedTopics[slide.id]) {
    return curatedTopics[slide.id];
  }

  const content = `${slide.title} ${slide.note} ${slide.script}`.toLowerCase();

  if (slide.kind === 'cta') {
    return ['Start With a Trial Stay', 'Your Next Step'];
  }

  if (slide.kind === 'quote') {
    if (content.includes('feet')) {
      return ['Decide With Your Feet'];
    }
    return ['A Quiet Reset'];
  }

  if (slide.kind === 'derived') {
    return [slide.title, 'Going deeper'];
  }

  const noteLead = slide.note.split('.').at(0)?.trim();
  return [noteLead || slide.title].slice(0, 2);
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
  const [latestOutputTranscript, setLatestOutputTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<(typeof VOICE_OPTIONS)[number]>('Zephyr');
  const [isIntroVisible, setIsIntroVisible] = useState(true);
  const [displaySubtitle, setDisplaySubtitle] = useState('');
  const [isSubtitleVisible, setIsSubtitleVisible] = useState(false);
  const [uiError, setUiError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [topicIndex, setTopicIndex] = useState(0);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const transcriptTimeoutsRef = useRef<number[]>([]);
  const autoAdvanceTimeoutRef = useRef<number | null>(null);
  const questionCommandTimeoutRef = useRef<number | null>(null);
  const pendingTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const hasNarratedSlideRef = useRef<number | null>(null);
  const selectedVoiceRef = useRef<(typeof VOICE_OPTIONS)[number]>('Zephyr');
  const suppressNextCloseErrorRef = useRef(false);
  const currentTurnKindRef = useRef<TurnKind>(null);
  const slidesRef = useRef<PresentationSlide[]>([]);
  const currentSlideIndexRef = useRef(0);
  const isActivatedRef = useRef(false);
  const handledQuestionTranscriptRef = useRef('');
  const introTimeoutRef = useRef<number | null>(null);
  const subtitleTimeoutRef = useRef<number | null>(null);
  const lastSubtitleTextRef = useRef('');
  const subtitleCommitWordCountRef = useRef(0);
  const topicTimeoutRef = useRef<number | null>(null);

  const isMobile = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const currentSlide = slides[currentSlideIndex] ?? null;
  const storyImages = useMemo(
    () =>
      [
        ...new Set(
          slides
            .map((slide) =>
              getOptimizedImageUrl(slide.imageUrl, {
                width: isMobile ? 900 : 1080,
                height: isMobile ? 1600 : 1920,
                quality: isMobile ? 64 : 70,
              }),
            )
            .filter(Boolean),
        ),
      ],
    [isMobile, slides],
  );
  const overallProgressPercent = slides.length
    ? ((currentSlideIndex + (isActivated ? 1 : 0)) / slides.length) * 100
    : 0;
  const STORY_DURATION_MS = 14000;
  const [storyElapsedMs, setStoryElapsedMs] = useState(0);
  const activeStoryIndex = storyImages.length
    ? Math.floor(storyElapsedMs / STORY_DURATION_MS) % storyImages.length
    : 0;
  const activeStoryProgressPercent = storyImages.length
    ? ((storyElapsedMs % STORY_DURATION_MS) / STORY_DURATION_MS) * 100
    : 0;
  const topicSequence = useMemo(() => buildTopicSequence(currentSlide), [currentSlide]);
  const activeTopic = topicSequence[Math.min(topicIndex, topicSequence.length - 1)] ?? '';

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    const uniqueImageUrls = [
      ...new Set(
        slides
          .map((slide) =>
            getOptimizedImageUrl(slide.imageUrl, {
              width: isMobile ? 900 : 1080,
              height: isMobile ? 1600 : 1920,
              quality: isMobile ? 64 : 70,
            }),
          )
          .filter(Boolean),
      ),
    ];

    for (const imageUrl of uniqueImageUrls) {
      const image = new window.Image();
      image.src = imageUrl;
    }
  }, [isMobile, slides]);

  useEffect(() => {
    currentSlideIndexRef.current = currentSlideIndex;
  }, [currentSlideIndex]);

  useEffect(() => {
    isActivatedRef.current = isActivated;
  }, [isActivated]);

  useEffect(() => {
    if (!isActivated || storyImages.length === 0) {
      setStoryElapsedMs(0);
      return;
    }

    const startedAt = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      setStoryElapsedMs(now - startedAt);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isActivated, storyImages.length]);

  useEffect(() => {
    if (introTimeoutRef.current !== null) {
      window.clearTimeout(introTimeoutRef.current);
      introTimeoutRef.current = null;
    }

    setIsIntroVisible(true);
    setDisplaySubtitle('');
    setIsSubtitleVisible(false);
    lastSubtitleTextRef.current = '';
    subtitleCommitWordCountRef.current = 0;

    if (!currentSlide) {
      return;
    }

    introTimeoutRef.current = window.setTimeout(() => {
      setIsIntroVisible(false);
    }, 2100);

    return () => {
      if (introTimeoutRef.current !== null) {
        window.clearTimeout(introTimeoutRef.current);
        introTimeoutRef.current = null;
      }
    };
  }, [currentSlide?.id]);

  useEffect(() => {
    const latestNarrationCue = buildSubtitleCue(latestOutputTranscript);
    let nextSubtitle = '';

    if (latestNarrationCue.text) {
      if (
        latestNarrationCue.mode === 'tail' &&
        displaySubtitle &&
        latestNarrationCue.totalWords - subtitleCommitWordCountRef.current < 6
      ) {
        return;
      }
      nextSubtitle = latestNarrationCue.text;
    } else if (isRecording) {
      nextSubtitle = liveTranscript.trim() || 'Listening...';
    } else if (!isActivated) {
      nextSubtitle = '';
    } else if (
      liveTranscript.trim() &&
      !['Beforest is speaking...', 'Beforest is responding...'].includes(liveTranscript.trim())
    ) {
      nextSubtitle = liveTranscript.trim();
    }

    if (nextSubtitle === lastSubtitleTextRef.current) {
      return;
    }

    if (subtitleTimeoutRef.current !== null) {
      window.clearTimeout(subtitleTimeoutRef.current);
      subtitleTimeoutRef.current = null;
    }

    lastSubtitleTextRef.current = nextSubtitle;

    if (!nextSubtitle) {
      setDisplaySubtitle('');
      setIsSubtitleVisible(false);
      subtitleCommitWordCountRef.current = 0;
      return;
    }

    const shouldAnimateIn = !displaySubtitle;
    subtitleTimeoutRef.current = window.setTimeout(
      () => {
        setDisplaySubtitle(nextSubtitle);
        if (shouldAnimateIn) {
          setIsSubtitleVisible(true);
        }
        if (latestNarrationCue.text) {
          subtitleCommitWordCountRef.current = latestNarrationCue.totalWords;
        }
      },
      shouldAnimateIn ? 120 : 320,
    );

    return () => {
      if (subtitleTimeoutRef.current !== null) {
        window.clearTimeout(subtitleTimeoutRef.current);
        subtitleTimeoutRef.current = null;
      }
    };
  }, [displaySubtitle, isActivated, isRecording, latestOutputTranscript, liveTranscript]);

  useEffect(() => {
    if (topicTimeoutRef.current !== null) {
      window.clearTimeout(topicTimeoutRef.current);
      topicTimeoutRef.current = null;
    }

    setTopicIndex(0);

    if (!isActivated || topicSequence.length < 2) {
      return;
    }

    topicTimeoutRef.current = window.setTimeout(() => {
      setTopicIndex(1);
    }, 18000);

    return () => {
      if (topicTimeoutRef.current !== null) {
        window.clearTimeout(topicTimeoutRef.current);
        topicTimeoutRef.current = null;
      }
    };
  }, [currentSlide?.id, isActivated, topicSequence.length]);

  function clearTranscriptQueue() {
    for (const timeoutId of transcriptTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    transcriptTimeoutsRef.current = [];
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

  function resetTurnUi(label: string) {
    pendingTranscriptRef.current = '';
    handledQuestionTranscriptRef.current = '';
    setLiveTranscript(label);
    setLatestOutputTranscript('');
    playerRef.current?.reset();
    clearTranscriptQueue();
    clearAutoAdvance();
    clearQuestionCommandTimeout();
  }

  function interruptCurrentTurn() {
    playerRef.current?.reset();
    clearTranscriptQueue();
    clearAutoAdvance();
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
        },
        onmessage: (message: LiveServerMessage) => {
          handleMessage(message);
        },
        onerror: (event: ErrorEvent) => {
          setConnectionState('error');
          setIsSwitchingVoice(false);
          setConnectionError(event.message);
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
      }
    }

    bootstrap();

    return () => {
      disposed = true;
      clearTranscriptQueue();
      clearAutoAdvance();
      clearQuestionCommandTimeout();
      if (introTimeoutRef.current !== null) {
        window.clearTimeout(introTimeoutRef.current);
      }
      if (subtitleTimeoutRef.current !== null) {
        window.clearTimeout(subtitleTimeoutRef.current);
      }
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

    if (hasNarratedSlideRef.current === currentSlideIndex) {
      return;
    }

    hasNarratedSlideRef.current = currentSlideIndex;
    narrateSlide(currentSlideIndex);
  }, [connectionState, currentSlide, currentSlideIndex, isActivated]);

  function buildNarrationPrompt(slide: PresentationSlide, slideIndex: number, totalSlides: number) {
    const position = `Internal context: scene ${slideIndex + 1} of ${totalSlides}.`;
    const scene = `Internal reference only. Title: "${slide.title}". Note: "${slide.note}". Approved spoken context: "${slide.script}".`;
    const openingFramework =
      slideIndex === 0
        ? 'Open as if someone just asked you, "So what exactly is Beforest?" Answer directly and naturally, without saying hello, welcome, or giving a formal agenda. In the first few lines, make three things clear in everyday language: what Beforest is, why it matters, and where this conversation is going. Use contractions. Keep the sentences short. Sound warm, thoughtful, and lightly informal, like a smart person explaining something clearly on a call. Do not explain controls, clicking, microphones, or app behavior unless the listener asks. After that orientation, move naturally into the substance.'
        : '';
    const close =
      slide.kind === 'cta'
        ? 'Close with conviction, invite them to take the trial stay at hospitality.beforest.co, and end with: You decide with your feet, not your eyes. See you in the slow lane.'
        : 'Close naturally. If it fits, leave a brief opening for questions, but do not turn it into interface guidance.';

    return `${position} ${scene} Speak for about 20 to 30 seconds. This is for internal guidance only: never say slide, scene, presentation, or "in this part". Never describe what is on the slide. Never say "this slide is about" or anything similar. Do not open with "hello", "welcome", "today I want to share", or other presentation language. Speak like a human guide on a thoughtful call, not a brochure or voice-over. ${openingFramework} ${close}`;
  }

  function sendTextTurn(text: string, kind: TurnKind) {
    if (!sessionRef.current || !text.trim()) {
      return;
    }

    currentTurnKindRef.current = kind;
    resetTurnUi(kind === 'narration' ? 'Beforest is speaking...' : 'Beforest is responding...');
    sessionRef.current.sendRealtimeInput({ text });
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
      return;
    }

    autoAdvanceTimeoutRef.current = window.setTimeout(() => {
      setCurrentSlideIndex((previous) => previous + 1);
    }, delayMs);
  }

  async function applyQuestionRouting(question: string) {
    if (!question.trim()) {
      scheduleNextSlide(1600);
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
        setLiveTranscript('Question answered. Staying on this slide.');
        return;
      }
    } catch {
      setLiveTranscript('Question answered. Staying on this slide.');
      return;
    }

    setLiveTranscript('Question answered. Staying on this slide.');
  }

  function handleTurnComplete() {
    const turnKind = currentTurnKindRef.current;
    currentTurnKindRef.current = null;
    if (turnKind === 'narration') {
      if (currentSlideIndexRef.current < slidesRef.current.length - 1) {
        scheduleNextSlide(2200);
      }
      return;
    }

    if (turnKind === 'question') {
      const question = pendingTranscriptRef.current.trim();
      pendingTranscriptRef.current = '';
      const targetIndex = parseNavigationCommand(question);
      if (targetIndex !== null && !Number.isNaN(targetIndex)) {
        applyNavigationCommand(targetIndex);
        return;
      }
      if (!shouldRouteQuestion(question)) {
        setLiveTranscript('Question answered. Staying on this slide.');
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
      const delayMs = Math.max(0, (playerRef.current?.getBufferedMs() ?? 0) - 120);
      const timeoutId = window.setTimeout(() => {
        setLatestOutputTranscript((previous) =>
          mergeOutputTranscriptSnapshot(previous, outputTranscript),
        );
      }, delayMs);
      transcriptTimeoutsRef.current.push(timeoutId);
    }

    if (serverContent?.interrupted) {
      playerRef.current?.reset();
      clearTranscriptQueue();
      clearAutoAdvance();
    }

    if (serverContent?.turnComplete) {
      handleTurnComplete();
    }
  }

  async function unlockAudioPlayback() {
    if (!playerRef.current) {
      playerRef.current = createPcmPlayer();
    }

    try {
      await playerRef.current.prepare();
    } catch {
      // Keep the presentation usable even if the browser rejects the warm-up attempt.
    }
  }

  async function activatePresentation() {
    if (isActivatedRef.current) {
      return;
    }

    await unlockAudioPlayback();
    setIsActivated(true);
    hasNarratedSlideRef.current = null;
  }

  async function prepareMicrophonePermission() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    stream.getTracks().forEach((track) => track.stop());
  }

  async function startRecording() {
    const session = sessionRef.current;
    if (!session || isRecordingRef.current) {
      return;
    }

    if (!isActivatedRef.current) {
      return;
    } else {
      await unlockAudioPlayback();
    }

    clearAutoAdvance();
    currentTurnKindRef.current = 'question';
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
    } catch (error) {
      setUiError(error instanceof Error ? error.message : 'Microphone access failed.');
      currentTurnKindRef.current = null;
      setLiveTranscript('');
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
    suppressNextCloseErrorRef.current = true;
    sessionRef.current?.close();

    try {
      await playerRef.current?.dispose();
      playerRef.current = null;
      await unlockAudioPlayback();
      await openLiveSession(nextVoice);
    } catch (error) {
      setConnectionState('error');
      setIsSwitchingVoice(false);
      setConnectionError(error instanceof Error ? error.message : 'Unable to switch voice.');
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
    if (isStarting || connectionState !== 'ready') {
      return;
    }

    setIsStarting(true);
    setUiError('');

    try {
      await prepareMicrophonePermission();
      await activatePresentation();
    } catch (error) {
      setUiError(
        error instanceof Error ? error.message : 'Microphone permission is required to begin.',
      );
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

      <section className="portrait-player">
        <div className="scene-stack" aria-live="off">
          {storyImages.map((imageUrl, index) => (
            <figure
              key={imageUrl}
              className={`scene-layer${index === activeStoryIndex ? ' active' : ''}`}
              aria-hidden={index !== activeStoryIndex}
            >
              <img src={imageUrl} alt="" />
            </figure>
          ))}
        </div>

        <div className="portrait-overlay">
          <div className="story-progress" aria-hidden="true">
            {storyImages.length
              ? storyImages.map((imageUrl, index) => (
                  <span
                    key={imageUrl}
                    className={[
                      'story-segment',
                      index < activeStoryIndex ? 'done' : '',
                      index === activeStoryIndex && isActivated ? 'active' : '',
                      index === activeStoryIndex && !isActivated ? 'current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span
                      className="story-fill"
                      style={{
                        transform:
                          index < activeStoryIndex
                            ? 'scaleX(1)'
                            : index === activeStoryIndex
                              ? `scaleX(${isActivated ? activeStoryProgressPercent / 100 : 0.22})`
                              : 'scaleX(0)',
                      }}
                    />
                  </span>
                ))
              : Array.from({ length: 4 }, (_, index) => (
                  <span key={index} className="story-segment">
                    <span className="story-fill" />
                  </span>
                ))}
          </div>

          {isActivated ? (
            <div className="topic-heading" aria-live="polite">
              <span>{activeTopic}</span>
            </div>
          ) : null}

          {isActivated ? (
            <div className={`intro-card${isIntroVisible ? '' : ' hidden'}`}>
              <p className="intro-label">{presentationTitle}</p>
              <h1>{currentSlide?.title ?? 'Loading presentation...'}</h1>
            </div>
          ) : null}

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

          <div className="bottom-progress" aria-hidden="true">
            <span style={{ width: `${overallProgressPercent}%` }} />
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
                disabled={connectionState !== 'ready' || isStarting}
              >
                <span>{isStarting ? 'Starting...' : 'Begin'}</span>
                <ArrowUpRight size={16} />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className="help-button"
            aria-label="Open presentation help"
            onClick={() => setIsHelpOpen(true)}
          >
            <Question size={16} weight="bold" />
          </button>

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
                    <span>Hold the mic, speak, then release.</span>
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
