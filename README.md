# Beforest Pipecat Gemini Live

A Beforest editorial presentation agent rebuilt on top of the Pipecat `gemini-live-web-starter`.

## What this repo now contains
- `client/` — Next.js editorial UI wrapped around Pipecat + Daily
- `server/` — Pipecat Gemini Live bot with Beforest grounding and tool calling
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
- Server-driven visual updates over RTVI server messages
- Approved knowledge docs and curated image manifest

## Before you test
Add env files first.

### Server
Create `server/.env` from `server/env.example` and set:
- `GOOGLE_API_KEY`
- `DAILY_API_KEY` or `DAILY_ROOM_URL`
- optional `GOOGLE_VOICE_ID`

### Client
Create `client/.env.local` from `client/env.example`.
For local development the default localhost value is already fine if your Pipecat server is running locally.

## Run locally
### 1. Start the bot
```bash
cd server
cp env.example .env
uv sync
uv run bot.py --transport daily
```

### 2. Start the client
```bash
cd client
cp env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and click **Begin live walkthrough**.

## Notes
- The old app remains in `../gemini-live-ppt` for reference.
- This repo intentionally keeps the realtime stack from Pipecat and the visual taste from your previous Beforest UI.
