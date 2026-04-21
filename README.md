# Beforest LiveKit Gemini Live

A Beforest editorial presentation agent rebuilt around LiveKit Agents and Gemini Live.

## What this repo now contains
- `client/` — Next.js editorial UI connected to LiveKit Sessions
- `server/` — LiveKit Gemini Live agent with Beforest grounding and tool calling
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
- Server-driven visual updates over LiveKit RPC
- Approved knowledge docs and curated image manifest

## Before you test
Add env files first.

### Server
Create `server/.env` from `server/env.example` and set:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `GOOGLE_API_KEY`
- optional `GOOGLE_VOICE_ID`

### Client
Create `client/.env.local` from `client/env.example`.
Use the same LiveKit project values as the server, plus the public agent/frontend names if you want to override the defaults.

## Run locally
### 1. Start the agent
```bash
cd server
cp env.example .env
uv sync
uv run python agent.py dev
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
- This branch keeps the Beforest visual shell, content files, curated images, and 10% narrative while replacing the Pipecat transport layer with LiveKit.
- Legacy Pipecat files still exist in the repo for reference during migration, but the new path is `client/app/api/token/route.ts` plus `server/agent.py`.
