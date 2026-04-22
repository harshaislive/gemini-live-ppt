# Beforest Direct Gemini Live

A Beforest editorial presentation experience rebuilt around direct Gemini Live, with passcode-gated access, curated visuals, and approved Beforest knowledge.

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
- Auto-start Gemini Live opening turn
- `retrieve_beforest_knowledge` tool
- `show_curated_image` tool
- Browser-side tool execution against approved Beforest content
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
- optional `PRESENTATION_PASSCODE`

## Run locally
### 1. Start the app
```bash
cd client
cp env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and click **Begin live walkthrough**.

## Notes
- The app now uses direct Gemini Live with ephemeral auth tokens minted by the Next.js backend.
- The old LiveKit/Pipecat runtime has been removed from the active deployment path.
