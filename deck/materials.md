# Deck Materials and Source Map

This file shows where the Beforest / 10% deck information currently lives.

## A) Current repo files

### 1. Runtime deck definition
- `presentation-content.ts`

What it contains:
- presentation title: `The 10% Life`
- current 10-scene runtime deck
- per-slide title, note, script, image URL
- CTA label and CTA URL
- compact brand rules used by the runtime

### 2. Runtime server behavior
- `server.ts`

What it contains:
- agent instructions for the live Beforest presentation
- how narration and Q&A are grounded in the deck and brand rules
- final CTA handling for `https://hospitality.beforest.co`

### 3. Public deck documentation already in this repo
- `public/PRESENTATION-HIERARCHY.md`
- `public/BRAND-AND-AGENT-RULES.md`
- `public/PPT-AUDIO-TRANSCRIPT.md`
- `public/brand_doc.md`

What they contain:
- hierarchy and source mapping
- brand / voice rules
- transcript for the frozen narrated package
- visual brand notes

### 4. UI integration
- `src/App.tsx`

What it contains:
- runtime prompt shaping
- open / close behavior in the presentation UI
- Beforest guide messaging in the app shell

---

## B) Linked canonical source package

Several docs in this repo point to the fuller Beforest content package located at:

- `/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest`

Key files there:
- `AGENTS.md`
- `soul.md`
- `flow.md`
- `product.md`
- `design.md`
- `cta/contact.md`
- `presentations/10_percent_lifestyle.json`

### What each source file does

#### `AGENTS.md`
Operational rules for how the presenter / agent should behave.

#### `soul.md`
Brand soul, voice, audience, and philosophical positioning.

#### `flow.md`
The canonical 7-stage story arc:
- tension
- reframe
- proof
- experience
- clarity
- urgency
- action

#### `product.md`
Ground truth for product facts:
- pricing
- membership structure
- collectives
- access rules
- trial stay framing

#### `design.md`
Visual behavior and composition rules.

#### `cta/contact.md`
Primary and secondary CTA structure and closing language.

#### `presentations/10_percent_lifestyle.json`
Canonical 7-slide source deck with titles, content, images, and notes.

---

## C) Two important deck variants

### Variant 1 — Canonical source deck
This is the original story-driven structure:
- 7 slides
- compact narrative arc
- used as the strategic content backbone

### Variant 2 — Current runtime deck in this repo
This is the implemented narrated version:
- 10 scenes
- expands the canonical arc with quote slides and a dedicated CTA close
- represented in `presentation-content.ts`

This means the current experience is not a contradiction of the source deck.
It is an **expanded runtime adaptation** of the same story.

---

## D) Main content buckets inside the deck

The deck materials break into these buckets:

1. **Brand / soul**
   - what Beforest is
   - how it sounds
   - what it must never sound like

2. **Product / 10% structure**
   - 30 person-nights/year
   - 10 years
   - 300 nights
   - access rules
   - trial stay logic

3. **Flow / storytelling**
   - tension → reframe → proof → experience → clarity → urgency → action

4. **Narration / transcript material**
   - long-form spoken scripts
   - short quote slides
   - CTA close

5. **Visual assets**
   - Supabase-hosted image URLs used by source and runtime decks

---

## E) Useful source references

### In this repo
- `presentation-content.ts`
- `public/PRESENTATION-HIERARCHY.md`
- `public/BRAND-AND-AGENT-RULES.md`
- `public/PPT-AUDIO-TRANSCRIPT.md`

### In linked source package
- `/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/flow.md`
- `/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/product.md`
- `/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/soul.md`
- `/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/cta/contact.md`
- `/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/presentations/10_percent_lifestyle.json`

## F) Practical summary

If you need to understand the deck quickly:
- read `deck/flow.md` for the narrative structure
- read `deck/beforest.md` for brand and positioning
- read `deck/10-percent.md` for product and membership rules
- use this file to trace the original sources
