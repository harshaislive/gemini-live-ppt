# Beforest Gemini Live migration notes

## Current direction

The project has moved to a direct Gemini Live architecture. The browser connects to Gemini Live with a short-lived auth token minted by the Next.js backend, while approved Beforest knowledge and visuals are loaded from the local content bundle.

## Why this direction replaced the starter runtime

- The shipped app needs one deployable Next.js container, not separate realtime infrastructure.
- Direct Gemini Live removes the Daily/Pipecat relay from the active path while keeping native speech, interruption, audio output, and transcription support.
- Server routes can keep sensitive API-key work on the backend while the browser owns the real-time user interaction.
- The content bundle remains deterministic: the app only retrieves from approved markdown and only displays curated images from the manifest.
- The presentation agenda now lives in app code, so the voice model performs the current section instead of controlling the whole flow.

## Preserved from earlier exploration

- Beforest visual language and Arizona typography
- Image-first editorial presentation style
- The 10% Life positioning and trial-stay CTA
- Approved markdown knowledge in `server/content/knowledge`
- Curated image manifest in `server/content/images/images.json`

## Replaced or removed from the active path

- Pipecat Python bot runtime
- Daily or LiveKit WebRTC room orchestration
- RTVI server-message visual updates
- Client configuration for a deployed bot start URL
- Separate server process outside the Next.js app

## Implementation targets now reflected in the repo

- Next.js editorial frontend in `client/app/ClientApp.tsx`
- Direct Gemini Live session handling through `@google/genai`
- Ephemeral Live token route at `client/app/api/gemini-live-token/route.ts`
- Passcode gate at `client/app/api/access/route.ts`
- Presentation bootstrap route at `client/app/api/presentation-context/route.ts`
- Planner route at `client/app/api/presentation-plan/route.ts`
- Browser-executed tools:
  - `retrieve_beforest_knowledge`
  - `show_curated_image`
  - `ask_listener_question`
- Single-container deployment through `Dockerfile` and `deploy/start-app.sh`
