# Beforest Controlled Narrator + Gemini Live

A Beforest editorial presentation experience built around committed narration audio, passcode-gated access, curated visuals, and a Gemini Live interruption mic.

## What this repo now contains
- `client/` — Next.js editorial UI and direct Gemini Live session handling
- `server/` — content bundle only (`content/knowledge`, `content/images`)
- `docs/RESEARCH_PLAN.md` — migration rationale
- `docs/IMPLEMENTATION_CONCEPT.md` — architecture and UX flow

## Implemented
- Starter-template migration scaffold
- Beforest visual shell with ABC Arizona fonts
- Full-bleed image stage and live subtitle banner
- Mic toggle + trial-stay CTA
- Instant static narrator start from committed WAV chunks
- Gemini Live only for tap-to-talk interruptions
- Runtime telemetry passed to Gemini before interruption answers
- Chunk-driven visuals, subtitles, modal pauses, and resume behavior
- Approved knowledge docs and curated image manifest
- Passcode gate + listener name capture
- Single-container Next.js deployment path

## Before you test
Add env files first.

### Client
Create `client/.env.local` from `client/env.example`.
Set:
- `GOOGLE_API_KEY`
- optional `GEMINI_LIVE_MODEL`
- optional `GEMINI_TTS_MODEL`
- optional `PRESENTATION_PASSCODE`

## Run locally
### 1. Start the app
```bash
cd client
cp env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and click **Begin walkthrough**.

## Narration assets
The release path uses checked-in audio snippets from `client/public/audio/narration`, driven by metadata in `client/app/presentationScript.ts`.

Regenerate narration after script edits:

```bash
cd client
npm run generate:narration
```

## Notes
- The presentation does not wait for Gemini Live before starting. Static narrator audio owns the core walkthrough.
- Gemini Live uses ephemeral auth tokens minted by the Next.js backend and is opened around mic interruptions.
- The old LiveKit/Pipecat runtime has been removed from the active deployment path.
