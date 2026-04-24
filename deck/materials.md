# Deck Materials and Source Map

This file shows where the Beforest / 10% presentation material lives in the current direct Gemini Live branch.

## Current repo files

### Runtime agenda
- `client/app/presentationAgenda.ts`

What it contains:
- guided presentation sections and segment gates
- allowed next-segment transitions
- modal prompt framing
- deterministic planner-decision coercion

### Live presentation runtime
- `client/app/ClientApp.tsx`

What it contains:
- direct Gemini Live session handling
- microphone capture and Gemini audio playback
- subtitle state
- visual updates from Gemini tool calls
- listener question modals and CTA actions

### Server route behavior
- `client/app/api/gemini-live-token/route.ts`
- `client/app/api/presentation-context/route.ts`
- `client/app/api/presentation-plan/route.ts`
- `client/app/api/access/route.ts`

What they contain:
- ephemeral Gemini Live token minting
- approved content bootstrap
- post-modal agenda planning
- optional passcode gating

### Approved content bundle
- `server/content/knowledge/*.md`
- `server/content/images/images.json`

What it contains:
- brand, product, flow, design, CTA, and transcript knowledge
- curated visuals and optional video URLs used by the live experience

### Shared runtime helpers
- `client/lib/beforest-runtime.ts`
- `client/lib/beforest-shared.ts`
- `client/lib/gemini-live-utils.ts`

What they contain:
- content loading and markdown chunking
- knowledge retrieval and curated image selection
- Gemini system instruction and opening prompt
- Gemini Live message and audio payload helpers

## Main content buckets

1. **Brand / voice**
   - what Beforest is
   - how the guide should sound
   - terms and framings to avoid

2. **Product / 10% structure**
   - thirty person-nights a year
   - ten-year rhythm
   - access without ownership
   - trial-stay framing

3. **Flow / storytelling**
   - tension
   - reframe
   - proof
   - experience
   - clarity
   - urgency
   - action

4. **Runtime agenda**
   - opening section
   - modal questions
   - planner-controlled transitions
   - CTA close

5. **Visual assets**
   - approved image paths
   - visual hooks and notes
   - tags used by `show_curated_image`

## Practical summary

If you need to understand the current presentation quickly:
- read `docs/IMPLEMENTATION_CONCEPT.md` for the runtime architecture
- read `client/app/presentationAgenda.ts` for the guided agenda
- read `client/lib/beforest-shared.ts` for the voice rules and tool behavior
- read `deck/flow.md`, `deck/beforest.md`, and `deck/10-percent.md` for the source narrative and product framing
