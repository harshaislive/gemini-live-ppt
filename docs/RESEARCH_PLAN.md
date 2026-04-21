# Beforest Gemini Live migration research plan

## Objective
Rebuild the live Beforest presentation on top of the Pipecat Gemini Live starter so the realtime stack is stable while the UI stays editorial and calm.

## Why this starter is the right base
- Native Gemini Live speech-to-speech pipeline
- Pipecat-managed Daily transport instead of a fragile custom browser audio stack
- Working transcription, interruption handling, and room lifecycle out of the box
- Python tool-calling support in the bot layer
- A Next.js frontend that can be fully re-skinned without touching the hard realtime plumbing

## What was preserved from the previous project
- Beforest visual language
- ABC Arizona typography
- The 10% Life framing and product context
- Image-first presentation logic
- Trial-stay CTA direction

## What was intentionally replaced
- Custom client-side Gemini session wiring
- Manual PCM recording and playback orchestration
- Slide-advance logic coupled to raw transcript timing
- The previous frontend app shell and server routes

## Research conclusions
1. The old app's strongest asset is its UI taste and product context, not its transport architecture.
2. The Pipecat starter already solves the unstable parts: Daily room creation, Gemini Live turn handling, audio transport, and transcription.
3. The cleanest migration path is not slide automation first; it is a guided live conversation with strong image-tooling and knowledge retrieval.
4. The frontend should listen for server visual messages so the backend can drive imagery through tool calls.
5. Approved markdown knowledge and curated visuals should live beside the bot for deterministic retrieval.

## Implementation targets
- New repo scaffolded from the Pipecat starter
- Beforest editorial frontend in `client/app/ClientApp.tsx`
- Approved markdown knowledge in `server/content/knowledge`
- Curated image manifest in `server/content/images/images.json`
- Two server tools:
  - `retrieve_beforest_knowledge`
  - `show_curated_image`
- Startup auto-intro on room connect
- CTA path to `https://hospitality.beforest.co`
