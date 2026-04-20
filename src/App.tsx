import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { ArrowUpRight, Microphone, PhoneDisconnect } from '@phosphor-icons/react';
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

interface TranscriptSegment {
  id: number;
  text: string;
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
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [activeTranscriptId, setActiveTranscriptId] = useState<number | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<(typeof VOICE_OPTIONS)[number]>('Zephyr');

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const transcriptTimeoutsRef = useRef<number[]>([]);
  const autoAdvanceTimeoutRef = useRef<number | null>(null);
  const questionCommandTimeoutRef = useRef<number | null>(null);
  const pendingTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const transcriptIdRef = useRef(0);
  const hasNarratedSlideRef = useRef<number | null>(null);
  const selectedVoiceRef = useRef<(typeof VOICE_OPTIONS)[number]>('Zephyr');
  const suppressNextCloseErrorRef = useRef(false);
  const currentTurnKindRef = useRef<TurnKind>(null);
  const slidesRef = useRef<PresentationSlide[]>([]);
  const currentSlideIndexRef = useRef(0);
  const isActivatedRef = useRef(false);
  const handledQuestionTranscriptRef = useRef('');

  const isMobile = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const currentSlide = slides[currentSlideIndex] ?? null;
  const currentSlideImageUrl = currentSlide
    ? getOptimizedImageUrl(currentSlide.imageUrl, {
        width: isMobile ? 840 : 1280,
        height: isMobile ? 473 : 720,
        quality: isMobile ? 62 : 70,
      })
    : '';

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    const uniqueImageUrls = [
      ...new Set(
        slides
          .map((slide) =>
            getOptimizedImageUrl(slide.imageUrl, {
              width: isMobile ? 840 : 1280,
              height: isMobile ? 473 : 720,
              quality: isMobile ? 62 : 70,
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
    setTranscriptSegments([]);
    setActiveTranscriptId(null);
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
    setTranscriptSegments([]);
    setActiveTranscriptId(null);
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
    const position = `You are guiding slide ${slideIndex + 1} of ${totalSlides}.`;
    const scene = `Current slide title: "${slide.title}". Slide note: "${slide.note}". Approved spoken context: "${slide.script}".`;
    const close =
      slide.kind === 'cta'
        ? 'Close with conviction, invite them to take the trial stay at hospitality.beforest.co, and end with: You decide with your feet, not your eyes. See you in the slow lane.'
        : 'Toward the end, ask if they have any questions. Tell them naturally that on desktop they can hold space to ask and release to send, and on mobile they can hold the mic and release. Mention that otherwise you will keep moving.';

    return `${position} ${scene} Narrate this scene now in about 20 to 30 seconds. Speak like a human guide, not a brochure. ${close}`;
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
        setLiveTranscript('Question answered. Staying on this slide. Hold space on desktop or hold the mic on mobile to ask more.');
        return;
      }
    } catch {
      setLiveTranscript('Question answered. Staying on this slide. Hold space on desktop or hold the mic on mobile to ask more.');
      return;
    }

    setLiveTranscript('Question answered. Staying on this slide. Hold space on desktop or hold the mic on mobile to ask more.');
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
        setLiveTranscript('Question answered. Staying on this slide. Hold space on desktop or hold the mic on mobile to ask more.');
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
      const segmentId = transcriptIdRef.current + 1;
      transcriptIdRef.current = segmentId;
      const delayMs = Math.max(0, (playerRef.current?.getBufferedMs() ?? 0) - 120);
      const timeoutId = window.setTimeout(() => {
        setTranscriptSegments((previous) =>
          [...previous, { id: segmentId, text: outputTranscript }].slice(-28),
        );
        setActiveTranscriptId(segmentId);
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

  async function startRecording() {
    const session = sessionRef.current;
    if (!session || isRecordingRef.current) {
      return;
    }

    if (!isActivatedRef.current) {
      await activatePresentation();
    } else {
      await unlockAudioPlayback();
    }

    clearAutoAdvance();
    currentTurnKindRef.current = 'question';
    resetTurnUi('Listening...');

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) {
        return;
      }
      event.preventDefault();
      void startRecording();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
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

  return (
    <main className="shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <section className="stage">
        <figure className="hero-image">
          <div className="hero-chrome">
            <div className="status-row" aria-label={`Connection status: ${connectionState}`} title={connectionState}>
              <span className={`status-dot ${connectionState}`} />
            </div>

            <div className="voice-switcher">
              <label htmlFor="voice-select">Voice</label>
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
          </div>

          {currentSlide ? (
            <img
              key={currentSlide.id}
              src={currentSlideImageUrl}
              alt={currentSlide.title}
            />
          ) : null}
        </figure>

        <header className="headline-block">
          <p className="eyebrow">
            {presentationTitle}
            {slides.length ? ` · ${currentSlideIndex + 1}/${slides.length}` : ''}
          </p>
          <h1>{currentSlide?.title ?? 'Loading presentation...'}</h1>
        </header>

        <p className="stream-copy" aria-live="polite">
          {transcriptSegments.length ? (
            transcriptSegments.map((segment) => (
              <span
                key={segment.id}
                className={`stream-word${segment.id === activeTranscriptId ? ' latest' : ''}`}
              >
                {segment.text}
              </span>
            ))
          ) : (
            <span className="stream-word placeholder">
              {liveTranscript ||
                (isActivated
                  ? 'The guide will keep moving through the deck. Hold space on desktop or hold the mic on mobile to ask.'
                  : 'Begin the presentation to unlock narration. The guide will move through the deck automatically.' )}
            </span>
          )}
        </p>

        <div className="action-row">
          {!isActivated ? (
            <button
              type="button"
              className="continue-button cta-button"
              onClick={() => void activatePresentation()}
              disabled={connectionState !== 'ready'}
            >
              <span>Begin</span>
              <ArrowUpRight size={18} />
            </button>
          ) : currentSlide?.ctaHref ? (
            <a className="continue-button cta-button" href={currentSlide.ctaHref} target="_blank" rel="noreferrer">
              <span>{currentSlide.ctaLabel ?? 'Start your trial'}</span>
              <ArrowUpRight size={18} />
            </a>
          ) : (
            <div className="auto-note">
              <span>Slides advance automatically. Interrupt anytime with a question.</span>
            </div>
          )}
        </div>
      </section>

      <div className="controls">
        {isMobile ? (
          <button
            type="button"
            className={`mic-button ${isRecording ? 'active' : ''}`}
            onPointerDown={() => void startRecording()}
            onPointerUp={() => void stopRecording()}
            onPointerCancel={() => void stopRecording()}
          >
            <Microphone size={28} weight="fill" />
          </button>
        ) : (
          <div className="desktop-hint">
            <kbd>Space</kbd>
            <span>{isRecording ? 'Release to ask' : 'Hold to ask a question'}</span>
          </div>
        )}
      </div>

      {connectionState === 'error' ? (
        <div className="error-banner">
          <PhoneDisconnect size={18} />
          <span>{connectionError}</span>
        </div>
      ) : null}
    </main>
  );
}

export default App;
