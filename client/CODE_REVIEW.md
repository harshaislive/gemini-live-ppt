# Client Code Review

**Date:** April 24, 2026
**Scope:** Current Next.js direct Gemini Live client and API routes

## Executive summary

The active branch is a direct Gemini Live Next.js app. The previous review notes that referenced Pipecat wrappers, screen-share layouts, and `EventStreamPanel.tsx` no longer apply because those files and components are not present in this branch.

The current client is cohesive and has focused tests around Gemini Live message utilities and presentation agenda coercion. The remaining risks are mostly around sensitive error handling, browser audio lifecycle complexity, and the size of `ClientApp.tsx`.

## Current architecture reviewed

- `client/app/ClientApp.tsx` - presentation UI, direct Live session lifecycle, microphone capture, audio playback, tool handling, subtitles, modal prompts, and CTA behavior.
- `client/app/api/access/route.ts` - optional passcode gate.
- `client/app/api/gemini-live-token/route.ts` - ephemeral Gemini Live token minting.
- `client/app/api/presentation-context/route.ts` - approved content bootstrap.
- `client/app/api/presentation-plan/route.ts` - planner model route for post-modal agenda routing.
- `client/app/presentationAgenda.ts` - segment map, allowed transitions, and planner decision coercion.
- `client/lib/beforest-runtime.ts` - content loading from `server/content`.
- `client/lib/beforest-shared.ts` - shared knowledge retrieval, image selection, and prompt helpers.
- `client/lib/gemini-live-utils.ts` - Live server message and audio helpers.

## Findings

### 1. API routes return raw error messages

**Severity:** Medium
**Files:** `client/app/api/gemini-live-token/route.ts`, `client/app/api/presentation-plan/route.ts`

Both routes return `error.message` directly to the browser. These messages can expose provider, configuration, or prompt-routing details.

**Recommendation:** Log the detailed server-side error and return a generic client-facing response:

```typescript
console.error("Gemini token route failed", error);
return new NextResponse("Unable to start the live guide.", { status: 500 });
```

Use a route-specific generic message for planner failures as well.

### 2. `ClientApp.tsx` concentrates too much runtime behavior

**Severity:** Medium
**File:** `client/app/ClientApp.tsx`

The component owns access flow, token refresh, Live session state, audio recording, audio playback, tool responses, modal timing, agenda routing, visual updates, and CTAs. That makes regressions harder to isolate.

**Recommendation:** Split along runtime boundaries when behavior changes next:

- `useGeminiLiveSession` for token/session/send/receive state.
- `useMicRecorder` for PCM capture, silence detection, and cleanup.
- `useGeminiAudioPlayback` for queued audio playback and subtitle timing.
- `usePresentationRuntime` for segment state, modal prompts, and planner calls.

This does not need a standalone refactor unless the runtime is being modified.

### 3. ScriptProcessorNode is deprecated

**Severity:** Medium
**File:** `client/app/ClientApp.tsx`

The microphone path uses `ScriptProcessorNode`, which still works in many browsers but is deprecated in favor of `AudioWorkletNode`.

**Recommendation:** Keep the current path if browser support is acceptable for the demo, but plan an AudioWorklet migration before production usage or broader browser testing.

### 4. Content path depends on process working directory

**Severity:** Low
**File:** `client/lib/beforest-runtime.ts`

The content root is resolved with `path.resolve(process.cwd(), "..", "server", "content")`. This matches the current local and Docker startup path, but it is sensitive to changes in how the Next.js app is launched.

**Recommendation:** Consider an optional `BEFOREST_CONTENT_ROOT` env var with the current relative path as the fallback.

### 5. Planner route has a good deterministic fallback but no direct tests

**Severity:** Low
**Files:** `client/app/api/presentation-plan/route.ts`, `client/app/presentationAgenda.test.ts`

The coercion logic is tested in `presentationAgenda.test.ts`, but the API route input parsing and fallback behavior are not directly covered.

**Recommendation:** Add a small route-level test or extract request parsing into a tested helper if planner behavior changes.

## Positive observations

- Direct Gemini Live connection uses ephemeral auth tokens instead of exposing `GOOGLE_API_KEY` to the browser.
- Passcode-protected routes consistently check the same access cookie.
- Approved knowledge and curated images are loaded from the local content bundle instead of generated ad hoc.
- `presentationAgenda.ts` constrains agenda transitions so the voice model cannot freely jump around the sales flow.
- Tests exist for Gemini Live audio extraction and agenda decision coercion.

## Suggested priority

1. Sanitize API route error responses.
2. Add `BEFOREST_CONTENT_ROOT` fallback support if deployment paths may vary.
3. Extract runtime hooks from `ClientApp.tsx` only when making the next substantive runtime change.
4. Plan an AudioWorklet microphone path before production-hardening the browser audio stack.
