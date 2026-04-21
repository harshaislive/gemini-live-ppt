# Pipecat-Informed Reliability Plan

This document translates the most relevant ideas from Pipecat's `gemini-live-web-starter` into a practical plan for this app.

It is not a recommendation to copy their product or UI. It is a plan to borrow the reliability patterns that matter for a live, immersive Beforest presentation.

## Goal

Improve live-session reliability, startup consistency, audio quality, subtitle behavior, and turn-taking without losing the current Beforest presentation experience.

## Why This Matters

The current app works, but it still depends on a fragile client-side live orchestration model:

- browser-managed PCM recording and playback
- frontend-guessed caption pacing
- slide progression inferred from partial model events
- manual coordination between narration, question turns, and UI state

That is the main reason regressions keep showing up in startup, caption sync, and narration continuity.

## Current Known Blocker

This is the highest-priority live issue at the time of writing:

- After clicking `Begin`, the voice still sometimes does not start at all in the live app.

This means the first implementation focus should not be general polish. It should be startup-path reliability and clear instrumentation for the very first narration turn.

Pipecat's starter is useful because it solves this class of problem with a more structured runtime:

- deterministic server-side kickoff
- transport-managed media flow
- explicit VAD-based turn management
- built-in metrics and event visibility
- cleaner separation between media, conversation state, and UI

## What We Should Borrow

### 1. Deterministic First-Turn Startup

Pipecat starts the first model response explicitly from the server when the client connects.

What to apply here:

- Move first-turn orchestration into a dedicated startup path with explicit success states:
  - session connected
  - playback unlocked
  - first narration request sent
  - first audio chunk received
- Stop relying on indirect React timing alone for first narration.
- Keep a single startup state machine instead of scattered refs and effects.

Expected impact:

- fewer "Begin clicked but nothing started" failures
- easier debugging when startup fails

### 2. Real Event Logging and Metrics

Pipecat enables metrics and usage reporting by default.

What to apply here:

- Add a lightweight internal event log for:
  - live session opened
  - narration turn requested
  - first output transcript received
  - first audio chunk received
  - generation complete
  - turn complete
  - audio queue drained
  - slide advanced
  - recording started/stopped
  - interruption detected
- Add timestamps and current slide id to every event.
- Surface a hidden debug panel or console logger in development mode.

Expected impact:

- we stop guessing why narration stalled
- regression diagnosis becomes faster

### 3. Turn Management Based on VAD and Clear State

Pipecat uses a VAD analyzer instead of custom turn heuristics.

What to apply here in the near term:

- Keep the current manual mic interaction for product UX if desired, but introduce a clearer turn-state model:
  - idle
  - starting narration
  - narrating
  - waiting for playback drain
  - listening
  - answering question
  - resuming story
- Remove duplicated timing logic spread across transcript, playback, and slide advance paths.
- Make one place in the app responsible for whether the system is currently narrating or listening.

Longer-term option:

- evaluate moving to a proper server-managed VAD/transport stack rather than continuing to expand the custom PCM path

Expected impact:

- fewer contradictory states
- fewer cases where the UI says one thing while the session does another

### 4. Looser, More Honest Caption Strategy

Pipecat treats transcript rendering as part of the live conversation UI, not a fake precision subtitle system.

What to apply here:

- Stop trying to imply exact subtitle sync.
- Use a rolling "stable spoken line" model:
  - keep the last visible line on screen until a clearly better one arrives
  - allow stable partials
  - promote complete sentences when available
- Separate caption display state from raw output transcript accumulation.
- Add a small dwell time before replacing a visible caption.

Expected impact:

- captions feel steadier
- fewer pops, blanks, and jumps

### 5. Better Media Lifecycle Handling

Pipecat uses transport abstractions instead of hand-built browser lifecycle wiring.

What to apply here:

- Centralize audio player lifecycle:
  - create
  - unlock
  - enqueue
  - drain
  - reset
  - dispose
- Centralize recorder lifecycle separately.
- Avoid silent failure in audio unlock and session start paths.
- Treat "no first audio chunk received within N seconds" as a detectable failure state.

Expected impact:

- better recovery from browser/device issues
- less hidden failure during startup

### 6. Production Audio Quality Guardrails

Pipecat optionally applies Krisp in production.

What to apply here:

- Add environment-specific audio quality guardrails:
  - stronger input noise handling
  - explicit browser/device checks
  - warnings when output cannot unlock
- Consider server-side noise suppression or improved client filtering if the current mic quality remains inconsistent.

Expected impact:

- fewer degraded live interactions in real audience settings

## What We Should Not Copy

These parts of the starter are not directly relevant to this app:

- football educational assistant framing
- screen-share-first UI
- resizable desktop app shell
- event-log-heavy visible interface

Our app should stay presentation-led, land-first, and visually restrained.

## Recommended Phases

## Phase 1: Observability and State Cleanup

Objective:
Make failures visible before changing architecture further.

Tasks:

- add a `LiveSessionEvent` log model
- log all critical turn and audio lifecycle events
- create a single conversation/turn state enum
- route narration/question transitions through one coordinator
- specifically instrument the `Begin` path:
  - begin clicked
  - playback unlock attempted
  - playback unlock succeeded/failed
  - first narration request sent
  - first transcript chunk received
  - first audio chunk received
  - first playback started

Definition of done:

- when narration fails to start, we can tell exactly whether it failed at session, unlock, request, transcript, or audio output stage

## Phase 2: Startup and Resume Reliability

Objective:
Make the main audience flow robust.

Tasks:

- make first narration kickoff deterministic
- add timeout detection for "no first audio chunk"
- ensure normal questions resume the story cleanly
- ensure slide advancement waits for actual playback drain

Definition of done:

- Begin consistently starts narration
- interruption and resume feel predictable
- next scene starts without hidden stalls

## Phase 3: Caption System Reset

Objective:
Make captions feel stable and believable.

Tasks:

- split raw transcript capture from displayed caption state
- implement rolling caption selection with dwell
- preserve last readable line until replacement is stable
- avoid blanking captions mid-thought

Definition of done:

- captions do not disappear or race most of the time
- captions no longer pretend to be frame-accurate karaoke

## Phase 4: Reduce Custom Media Fragility

Objective:
Decide whether to continue evolving the custom browser PCM stack or move toward a transport abstraction.

Tasks:

- evaluate whether current browser-only approach is still worth maintaining
- compare current model against:
  - server-managed media transport
  - Pipecat-style pipeline
  - WebRTC-based transport path
- estimate migration effort and reliability gain

Definition of done:

- we have a clear decision document:
  - stay on current architecture with targeted hardening
  - or migrate toward a server-managed realtime stack

## Immediate Practical Changes To Prioritize

If we want the fastest improvement path without a full architecture migration:

1. Fix the `Begin` to first-audio path first and add explicit logging around it.
2. Add event logging and turn-state cleanup.
3. Rework first-turn startup into a deterministic coordinator.
4. Rebuild captions as a rolling stable-line system.
5. Add explicit first-audio timeout/error handling.
6. Revisit transport architecture only after we can measure current failure modes clearly.

## Risks

### Staying On Current Architecture

- continued fragility around browser audio lifecycle
- more edge-case regressions as features accumulate
- harder-to-debug sync issues

### Migrating Too Early

- disruption to current presentation UX
- increased implementation scope
- possible need to redesign auth/session flow

## Decision Recommendation

Recommended path:

- Do not jump straight into a Pipecat migration.
- First, apply Pipecat's operational lessons inside the current app:
  - deterministic startup
  - metrics/logs
  - explicit turn-state modeling
  - honest caption behavior
- If reliability still remains fragile after that, move to a server-managed realtime transport architecture.

## Source References

- Pipecat starter repo:
  - https://github.com/pipecat-ai/gemini-live-web-starter
- Pipecat guide:
  - https://docs.pipecat.ai/pipecat/features/gemini-live
- Pipecat Gemini transport docs:
  - https://docs.pipecat.ai/api-reference/client/js/transports/gemini
- Pipecat Gemini Live server docs:
  - https://docs.pipecat.ai/api-reference/server/services/s2s/gemini-live
