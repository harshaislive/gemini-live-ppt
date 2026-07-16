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

## Sales invite generator

Set `INVITE_CREATOR_KEY` to a long private value in the server environment. Sales can then open:

```text
https://live.10percent.beforest.co/invites/create?key=YOUR_PRIVATE_KEY&uses=5&expires=14d&campaign=sales
```

The page collects the recipient's name plus an email or phone number, creates a six-digit passcode, and returns a copy-ready presentation link. `uses`, `expires`, and `campaign` are controlled by the creator URL rather than editable fields on the page. The private key is exchanged for a 12-hour secure cookie and removed from the address bar after the page opens.

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
