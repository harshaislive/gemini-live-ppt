# Deep App Audit - 2026-04-26

Scope: Beforest Gemini Live presentation app in `client/`.

Verification run:

- `npm run lint` - pass
- `npm test` - pass, 4 files / 18 tests
- `npm run build` - pass

Current git note: `brand_guide.md` is untracked and was not touched.

## Executive Read

The app is stable enough to build and test, but the remaining quality risks are audience-facing. The largest issue is that the app still presents itself as adaptive while most choices do not actually alter the deterministic walkthrough. The second issue is subtitle timing: WAV metadata is now correct, but the rendered subtitle path still uses a separate fixed phrase clock for narration. The third issue is mic/live resilience: failure recovery is much better now, but the experience still depends on several async refs and timers inside one large component, which makes regressions likely.

Recommended next sprint: fix subtitle rendering, make modal choices visibly change the path, add modal accessibility, add `.leads/` to `.gitignore`, and extract the live mic state machine into a tested hook.

## P0 - Fix Before Audience Demo

### 1. Rendered Subtitles Still Use Fixed Phrase Timing

Evidence:

- `presentationScript.ts` has duration-aligned metadata for each WAV.
- `ClientApp.tsx` updates `narratorSubtitle` using `buildTranscriptWindow(...)`.
- But the rendered subtitle uses `renderTrackedNarrationSubtitle()` whenever `shouldTrackNarrationWords` is true.
- `renderTrackedNarrationSubtitle()` uses fixed `wordsPerPhrase = 5` and `phraseSeconds = 2.7`, not actual chunk duration or WAV timing.

Why it matters:

The duration test now proves the declared WAV durations are right, but the visible subtitle can still drift. Static probe results show the tracked subtitle clock is slower than actual audio for most chunks:

- `access_without_ownership`: audio 25.291s, tracked approx 40.5s
- `why_ten_percent`: audio 23.331s, tracked approx 35.1s
- `decision_close`: audio 24.411s, tracked approx 35.1s

Impact:

This explains the “subtitles feel fast/late” feedback pattern. The app has two subtitle systems, and only one was corrected.

Recommendation:

Remove `renderTrackedNarrationSubtitle()` or rewrite it to use `buildTranscriptWindow(currentChunk.transcript, narratorElapsedSeconds, currentChunk.durationSeconds, SUBTITLE_LEAD_SECONDS)`. Then add a test that proves the rendered subtitle reaches the last words near chunk end for every chunk.

### 2. Early Modal Choices Do Not Actually Adapt the Walkthrough

Evidence:

- `NARRATION_GATES` asks meaningful questions after the ecosystem and proof chunks.
- `getPromptAnswerAction()` returns custom actions only for `gateId === "next-step"`.
- All earlier answers return `"continue"`.

Why it matters:

The first two questions ask what the listener needs, but the next narration is always the same fixed chunk. That can feel like fake interactivity, especially in a live sales/presenter environment.

Impact:

Audience members may tap “How 30 person-nights works” or “Blyton trial stay first” and still hear the default emotional sequence. This weakens trust in the guided experience.

Recommendation:

Implement deterministic branch routing for all gates:

- Opening gate:
  - “Access without ownership” -> continue to `why_ten_percent`
  - “How 30 person-nights works” -> jump to `membership_structure`
  - “Blyton trial stay first” -> jump to `blyton_first`
  - “Serious reset” -> continue to `why_ten_percent`
- Proof gate:
  - “Trying Blyton first” -> jump to `blyton_first`
  - “30 person-nights must be practical” -> jump to `membership_structure`
  - Family/place answers -> continue to `membership_structure`

Add tests for these routes.

### 3. Lead Fallback Writes PII to `.leads/`, but `.leads/` Is Not Ignored

Evidence:

- `api/subscribe-lead/route.ts` falls back to `process.cwd()/.leads/beforest-updates.jsonl`.
- Root `.gitignore` does not include `.leads/` or `client/.leads/`.

Why it matters:

If the webhook env is missing in production or during local demos, name/email/phone can be written locally. Without an ignore rule, that data can be accidentally staged.

Recommendation:

Add `.leads/` and `client/.leads/` to `.gitignore`. Also consider returning `503` for webhook failure instead of `400`, so invalid input and server persistence failure are not merged into the same class.

## P1 - High-Value UX Improvements

### 4. Dialogs Need Basic Accessibility and Keyboard Behavior

Evidence:

- Prompt and subscribe modals use `role="dialog"` and `aria-modal="true"`.
- Inputs rely on placeholders only.
- There is no Escape key close, focus trap, initial focus, or focus return to the triggering control.

Why it matters:

In a live demo, keyboard/focus issues can look like the app is frozen. Placeholder-only inputs are also weaker for accessibility and autofill clarity.

Recommendation:

Create a small `ModalShell` component that handles Escape, focus trap, initial focus, and focus return. Add visible or screen-reader labels for name, email, phone, and passcode.

### 5. The Live Mic State Machine Is Too Large and Too Implicit

Evidence:

- One component owns access, narration, Gemini token lifecycle, websocket callbacks, mic stream, worklet/processor fallback, live playback, speech recognition, modal flow, and lead capture.
- Live state is spread across `livePhase`, `isMicOpen`, `liveQuestionActiveRef`, `liveSocketOpenRef`, `sessionRef`, `answerTimeoutRef`, `liveAnswerResumeTimeoutRef`, and audio source sets.

Why it matters:

The current code works, but regression risk is high. Small changes can cause double-resume, stuck disabled buttons, stale transcripts, or sessions closing under active playback.

Recommendation:

Extract `useLiveQuestion()` with explicit states:

- `idle`
- `connecting`
- `listening`
- `sending`
- `answering`
- `recovering`
- `unavailable`

Then unit-test transitions without rendering the whole app.

### 6. Live Answer Subtitles Can Be Stale or Empty When Audio Starts

Evidence:

- Audio payload calls `scheduleLiveAudioPlayback(message, pendingBotTranscriptRef.current)`.
- `pendingBotTranscriptRef` is updated only when output transcription messages arrive.

Why it matters:

Gemini Live audio and transcription can arrive in different order. If audio arrives before transcription, the answer panel may show “Answering now...” or stale text while audio is already playing.

Recommendation:

Render the full live answer stream independently from audio chunk timing. Treat output transcription as the source of text truth, and use audio payload only for playback. Keep the “speaking” indicator tied to active audio sources.

### 7. First Mic Tap Still Has Latency by Design

Evidence:

- On mic open, the app requests browser mic permission and Gemini Live session in parallel.
- The narrator is paused only after both session and mic stream resolve.

Why it matters:

This avoids awkward silence if Live fails, but it means the first tap can feel delayed because the narration continues while the app says it is opening the mic. For a presenter experience, perceived response matters as much as actual response.

Recommendation:

On mic tap, immediately show a clear “Opening mic” micro-state near the control while narration continues. If connecting takes more than 1.5s, show “Still opening. Narration will pause once the mic is ready.” Keep the current recovery behavior.

## P2 - Maintainability and Polish

### 8. CSS Has Too Many Historical Override Layers

Evidence:

- `globals.css` has multiple passes for the same selectors: original controls, surgical art direction, product-readiness pass, editorial cleanup, premium black layer.
- Many earlier properties are later neutralized by later selectors.

Why it matters:

The cascade is now harder to reason about than the UI itself. Future visual fixes can accidentally reintroduce old brown/green/glass states or mobile layout conflicts.

Recommendation:

Refactor the Beforest section of `globals.css` into grouped final-state blocks:

- shell/video/scrim
- typography/subtitles
- primary controls
- live panel
- decision CTA
- modal/shared
- subscribe flow
- responsive overrides

No behavior change needed; this is a cleanup after the UX fixes.

### 9. Asset Weight Is Acceptable but Can Be Better

Evidence:

- Active video: `beforest-10-percent-live-720.mp4` is 7.55 MB.
- Unused 1080 video is 21.16 MB.
- Narration WAVs total about 9 MB.

Why it matters:

The all-audio preload was removed, which helps. But WAV narration is still heavy compared with AAC/MP3/Opus for web delivery.

Recommendation:

Convert narration WAVs to compressed web audio after the script stabilizes. Keep the WAV duration regression test by reading whichever committed audio format becomes canonical, or keep source WAVs outside the shipped public path.

### 10. Presentation Agenda and Narration Script Are Diverging

Evidence:

- `presentationAgenda.ts` still describes agentic section routing and a 9-stage flow.
- `presentationScript.ts` is the actual deterministic 8-chunk runtime.

Why it matters:

Future edits may update the agenda but not the actual audio chunks, or vice versa. This is especially risky because the app has moved from realtime narration toward committed audio.

Recommendation:

Either retire the planner agenda from runtime-facing docs or make `presentationScript.ts` the single source of truth. Add a short comment at the top of `presentationAgenda.ts` if it is now legacy/planner reference only.

## Testing Gaps

Current coverage is useful and green:

- Gemini Live utility parsing/merge helpers.
- Agenda coercion.
- Narration WAV duration alignment.
- Final prompt action routing.
- Subscribe lead validation/persistence fallback.

Missing coverage to add next:

- Subtitle rendering path used by `ClientApp`, not just `buildTranscriptWindow`.
- All modal answer routes, not only final gate.
- Live mic transition reducer/hook once extracted.
- Subscribe modal flow: contact -> three answer taps -> API submit -> external URL open.
- Accessibility smoke test for dialogs once a browser test runner is added.

## Suggested Fix Order

1. Fix rendered subtitle timing and add a regression test.
2. Implement deterministic routing for all modal answers and test it.
3. Add `.leads/` ignore rules.
4. Add modal accessibility shell and labeled inputs.
5. Extract/test live mic state machine.
6. Consolidate CSS override layers.
7. Convert narration assets to web audio format.

