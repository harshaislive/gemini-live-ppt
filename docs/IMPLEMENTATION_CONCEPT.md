# Beforest implementation concept

## Runtime architecture

### Frontend
- Next.js app from the Pipecat starter
- Custom editorial shell instead of the default logs/screenshare console
- Full-bleed image stage
- Topic hook and note below the image stage
- Stable subtitle banner fed by Pipecat transcript events
- Minimal control dock with mic toggle and trial-stay CTA

### Backend
- Pipecat Python bot using Gemini Live
- Daily transport for WebRTC audio
- One auto-start opening turn on client connect
- Tool-calling for knowledge retrieval and image selection
- RTVI server messages used to push visual updates into the frontend

## Tool contract

### `retrieve_beforest_knowledge`
Purpose: search approved markdown files and return grounded excerpts.

When the model should use it:
- pricing questions
- membership structure questions
- collectives and locations
- trial-stay mechanics
- contact details
- any answer that needs factual grounding

### `show_curated_image`
Purpose: pick the best approved visual for the current topic and update the UI.

When the model should use it:
- opening
- moving from tension to reframe
- proof and stewardship sections
- collective or location explanations
- urgency moments
- final CTA

## UX flow
1. User lands on a calm Beforest splash screen.
2. User clicks `Begin live walkthrough`.
3. Pipecat starts the Daily room and Gemini Live bot.
4. The bot sends an initial visual message to the client.
5. The bot begins the opening answer automatically.
6. The user can open the mic and interrupt naturally.
7. As topics shift, the bot calls `show_curated_image` and the frontend swaps visuals.
8. When factual questions arise, the bot calls `retrieve_beforest_knowledge` before answering.

## Files added or changed
- `client/app/ClientApp.tsx`
- `client/app/globals.css`
- `client/app/layout.tsx`
- `client/app/page.tsx`
- `client/app/beforest.ts`
- `server/bot.py`
- `server/beforest_runtime.py`
- `server/content/knowledge/*.md`
- `server/content/images/images.json`

## What still needs env to test
- `server/.env` with `GOOGLE_API_KEY` and Daily credentials
- `client/.env.local` with `BOT_START_URL` if you want to point the client at a deployed Pipecat bot
