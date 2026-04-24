# BEFA-14 Plan: Major App UX Issues

## Executive read

The source tree does not show a broken app build. Tests pass, lint passes, and the Next.js app builds successfully. The problem described in `BEFA-14` is a runtime experience gap: the live presentation relies on Gemini Live state transitions, but the product does not yet define a resilient degraded mode, explicit loading choreography, or measurable success criteria for the journey.

The right near-term move is not to replace Gemini Live outright. It is to add a hybrid operating model:

1. Keep Gemini Live as the primary interaction path for the live guide and user interrupt flow.
2. Add deterministic audio-first loading and recovery states for moments when live session setup, token minting, or first response latency is slow.
3. Instrument the funnel so we can distinguish product friction from model latency, browser permission issues, or credential/configuration failures.

## What was verified from code

- `client` tests pass: `13/13`.
- `client` lint passes.
- `client` production build passes.
- The app is a single Next.js deployment using direct Gemini Live from the browser.
- The UI already has basic fallback behavior for modal questions and microphone silence.
- The UI does not yet have a full degraded-mode journey for:
  - token mint failure
  - live session connect failure
  - delayed first model audio
  - reconnect after session close
  - deterministic non-live narration while waiting

## Current UX diagnosis

### Observed product risks

1. The primary CTA does too many jobs.
   The same control starts the walkthrough, opens the mic, and acts as a reconnect entrypoint. That makes state interpretation harder for users when the session is slow or fails.

2. Loading feedback is mostly textual.
   The app shows subtitle text such as "Preparing the live guide..." and "Connecting to Gemini Live...", but it does not yet provide a polished deterministic waiting experience that feels intentional.

3. Failure handling is technical, not editorial.
   When token or session setup fails, the product shows the raw error or a generic failure message. That protects correctness, but it does not preserve the presentation experience.

4. The fallback strategy is incomplete.
   There is fallback logic for question modals and silent mic turns, but not for the broader "guide still feels alive while infrastructure catches up" problem described in the issue.

5. Measurement is absent.
   There is no event schema for tracking where users drop:
   - access gate
   - preload
   - live connect
   - first audio
   - first interrupt
   - modal completion
   - trial-stay CTA click

6. Deployment has a trace-root risk.
   Next.js was inferring the workspace root from a lockfile outside this project. That is now pinned in `client/next.config.ts` so tracing is project-local and reproducible.

## Ideal user journey

### Target experience

1. User lands on the page and immediately understands this is a guided cinematic walkthrough.
2. User enters name and passcode if required.
3. App visibly transitions into a prepared state within 1-2 seconds.
4. User starts the walkthrough and hears either:
   - live Gemini narration immediately, or
   - a deterministic editorial bridge audio while the live session finishes connecting.
5. User can interrupt naturally with the mic at any point once live is ready.
6. If live is delayed or fails, the app never appears dead; it moves into a clear recovery state with a next best action.
7. The experience closes on one decision: trial stay, updates, membership clarity, or exit.

### Non-goals

- Do not fully replace live interaction with pre-rendered audio.
- Do not let deterministic snippets become the main product path.
- Do not measure success using only clicks; we need stage-level progression.

## Recommended product strategy

### Decision

Adopt a hybrid "deterministic bridge + live core" approach.

### Why

- Gemini Live remains the differentiated part of the product.
- Deterministic audio snippets are useful as transition cover, not as the main narration engine.
- This reduces perceived latency without giving up live interruption and grounded Q&A.

### Where deterministic audio should be used

- app open to guide prepared
- start click to live session ready
- live session ready to first model audio, if latency exceeds threshold
- reconnect after session drop
- token/session failure handoff into retry or non-live preview mode

## Plan of action

### Phase 1: Define and instrument the funnel

Add a client-side event schema before changing major UX behavior.

Required events:

- `beforest_access_viewed`
- `beforest_access_submitted`
- `beforest_access_granted`
- `beforest_context_preload_started`
- `beforest_context_preload_completed`
- `beforest_gemini_token_requested`
- `beforest_gemini_token_received`
- `beforest_live_connect_started`
- `beforest_live_connect_open`
- `beforest_live_first_audio_received`
- `beforest_live_error`
- `beforest_mic_opened`
- `beforest_mic_closed`
- `beforest_user_turn_silent`
- `beforest_modal_shown`
- `beforest_modal_answered`
- `beforest_trial_stay_clicked`
- `beforest_founding_silence_clicked`

Metric definitions:

- `guide_prepare_rate` = sessions with successful context preload / sessions that reached access-ready state.
- `live_connect_rate` = sessions with `beforest_live_connect_open` / sessions with `beforest_live_connect_started`.
- `time_to_first_audio_ms` = timestamp of first model audio minus timestamp of live connect start.
- `mic_success_rate` = mic turns that end with speech detected / mic opens.
- `modal_completion_rate` = answered modals / shown modals.
- `trial_intent_rate` = sessions with trial CTA click or final modal answer equivalent to trial stay / sessions with live connect open.

Attribution assumptions:

- A "session" should be browser-tab scoped unless a stable server session identifier is added.
- CTA attribution should be last-touch within the same page session.
- If the user refreshes, treat it as a new session unless persistent session identity is intentionally added.

Data-source caveats:

- Current repo does not contain analytics transport, warehouse schema, or dashboard code.
- Without runtime credentials and a deployed environment, latency metrics can only be specified, not benchmarked.
- Local dev results will understate real mobile/network failure rates.

### Phase 2: Introduce resilient waiting states

Replace generic waiting with explicit states:

- `preparing`
- `connecting_live`
- `warming_intro`
- `live_ready`
- `recovering`
- `live_unavailable`

Behavior changes:

- If live is not open within a short threshold, play a deterministic editorial bridge audio.
- If the token request fails, show a branded recovery state with retry instead of a raw backend error.
- If the session closes after prior success, offer reconnect without resetting the whole journey immediately.

### Phase 3: Separate controls by user intent

Split the current single CTA into:

- `Start walkthrough`
- `Ask by voice`
- `Retry live`

This removes ambiguity between playback state and question state.

### Phase 4: Add a credential-backed test pass

Once credentials are provided in `client/.env.local`, run:

- token mint validation
- live session open test
- first audio latency measurement
- mic permission and interruption test
- mobile browser smoke test
- recovery-state smoke test with forced token/session failures

Required env placeholders only:

- `GOOGLE_API_KEY`
- optional `PRESENTATION_PASSCODE`
- optional `GEMINI_LIVE_MODEL`
- optional `GEMINI_PLANNER_MODEL`
- optional `GOOGLE_VOICE_ID`

Do not invent values. Use the configured env placeholders already defined in `client/env.example`.

## Success criteria

Ship Phase 1 and Phase 2 only when these are measurable:

- `guide_prepare_rate >= 95%`
- `live_connect_rate >= 90%`
- `time_to_first_audio_ms p50 <= 2500`
- `time_to_first_audio_ms p90 <= 6000`
- `mic_success_rate >= 85%`
- `modal_completion_rate >= 80%`

These are launch thresholds, not permanent targets. They should be recalibrated after real traffic.

## Immediate next step for the CEO

Approve this sequence:

1. Instrument the funnel.
2. Build deterministic bridge/recovery audio states.
3. Run credential-backed validation.
4. Review a decision dashboard before deeper architecture changes.

If credentialed testing is wanted now, provide `.env.local` values through the configured placeholders so the live-path validation can begin.
