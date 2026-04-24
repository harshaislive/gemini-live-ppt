# Beforest implementation concept

## Runtime architecture

The current branch runs as a single Next.js app that connects the browser directly to Gemini Live. There is no active Pipecat, Daily, LiveKit, RTVI, or Python bot runtime in the deployment path.

### Client
- `client/app/ClientApp.tsx` owns the editorial presentation shell, listener name/passcode flow, Gemini Live session lifecycle, microphone capture, audio playback, subtitles, modal prompts, visual state, and CTA actions.
- The browser receives a one-use Gemini Live auth token from the Next.js backend, opens the Live session with `@google/genai`, and streams microphone PCM audio directly to Gemini.
- Gemini tool calls are handled in the browser against preloaded approved content:
  - `retrieve_beforest_knowledge` searches approved markdown chunks.
  - `show_curated_image` selects and displays an approved visual.
  - `ask_listener_question` pauses the walkthrough with a multiple-choice modal.
- `client/app/presentationAgenda.ts` defines the guided presentation sections and gates. The app sends runtime-state prompts so Gemini performs the current section instead of choosing the agenda order itself.

### API routes
- `client/app/api/access/route.ts` reports passcode requirements and sets the access cookie when `PRESENTATION_PASSCODE` is configured.
- `client/app/api/presentation-context/route.ts` loads the initial visual, curated image manifest, approved knowledge chunks, and opening prompt from the local content bundle.
- `client/app/api/gemini-live-token/route.ts` mints short-lived, one-use Gemini Live auth tokens with the system instruction, voice, transcription, and model constraints locked into the token.
- `client/app/api/presentation-plan/route.ts` uses a non-live Gemini planner model to choose the next allowed agenda segment after a modal answer. The route falls back to deterministic coercion when the model response is invalid.

### Content bundle
- `server/content/knowledge/*.md` contains approved Beforest knowledge used for retrieval.
- `server/content/images/images.json` contains approved visuals and optional video URLs.
- `client/lib/beforest-runtime.ts` loads this bundle from `../server/content` at runtime and chunks markdown for client-side retrieval.
- `client/lib/beforest-shared.ts` contains the shared retrieval, image-selection, system-instruction, and opening-prompt logic used by the API routes and browser runtime.

### Deployment path
- `Dockerfile` installs and builds the Next.js client, copies `server/content` into the image, and starts `next start`.
- `deploy/start-app.sh` runs the built Next.js app on `0.0.0.0` using `PORT` or `3000`.
- The active runtime is therefore one container with Next.js server routes plus static content assets.

## UX flow

1. The user opens the Next.js app.
2. The app checks `/api/access`; when configured, the user enters the presentation passcode and their name.
3. The client preloads `/api/presentation-context` and requests `/api/gemini-live-token`.
4. The user clicks `Begin live walkthrough`.
5. The browser opens a direct Gemini Live session using the ephemeral token.
6. The opening prompt starts the guided Beforest 10% narrative automatically.
7. The user can tap the mic, speak, and pause; the browser sends PCM audio directly to Gemini.
8. Gemini audio and transcription events drive playback and the subtitle ribbon.
9. Gemini function calls update visuals, retrieve approved knowledge, or pause for a modal question.
10. After modal answers, `/api/presentation-plan` chooses the next allowed segment and the client sends the next runtime-state prompt.

## Required environment

Create `client/.env.local` from `client/env.example`.

- `GOOGLE_API_KEY` is required for token minting and planner calls.
- `GEMINI_LIVE_MODEL` is optional and defaults to `gemini-2.5-flash-native-audio-preview-12-2025`.
- `GEMINI_PLANNER_MODEL` is optional and defaults to `gemini-2.5-flash`.
- `GOOGLE_VOICE_ID` is optional and defaults to `Gacrux`.
- `NEXT_PUBLIC_GOOGLE_VOICE_ID` is optional UI metadata and defaults to `Gacrux`.
- `PRESENTATION_PASSCODE` is optional; when set, API routes require the access cookie.

## Current file map

- `client/app/ClientApp.tsx` - main browser runtime and UI
- `client/app/api/access/route.ts` - passcode gate
- `client/app/api/gemini-live-token/route.ts` - Gemini Live ephemeral auth token route
- `client/app/api/presentation-context/route.ts` - content/bootstrap route
- `client/app/api/presentation-plan/route.ts` - agenda planner route
- `client/app/presentationAgenda.ts` - guided segment map and planner coercion
- `client/lib/beforest-runtime.ts` - server-side content loading
- `client/lib/beforest-shared.ts` - shared retrieval, image selection, and prompt helpers
- `client/lib/gemini-live-utils.ts` - Live message/audio helpers
- `server/content/knowledge/*.md` - approved knowledge
- `server/content/images/images.json` - curated visual manifest
