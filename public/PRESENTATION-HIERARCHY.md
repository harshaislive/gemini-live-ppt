# Presentation Hierarchy And Current Flow

## Branch Context

- Current branch: `realtime-version2`
- Main presentation slug: `10_percent_lifestyle`
- Presentation title: `The 10% Life`
- Current default experience on this branch: `realtime`
- Stable frozen static package still exists locally as a separate asset layer

## Where The Presentation Lives

### 1. Source Content Package

Primary local project folder:
- [content/projects/beforest](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest)

Key files:
- Main presentation JSON: [content/projects/beforest/presentations/10_percent_lifestyle.json](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/presentations/10_percent_lifestyle.json)
- Project constitution: [content/projects/beforest/AGENTS.md](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/AGENTS.md)
- Persona / voice: [content/projects/beforest/soul.md](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/soul.md)
- Presentation flow / pacing: [content/projects/beforest/flow.md](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/flow.md)
- Product / factual grounding: [content/projects/beforest/product.md](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/product.md)
- Visual context: [content/projects/beforest/design.md](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/design.md)
- CTA rules: [content/projects/beforest/cta/contact.md](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/cta/contact.md)
- Loading quotes: [content/projects/beforest/loading_quotes.json](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/loading_quotes.json)

Note:
- The local JSON is a project mirror, not the current source of truth for this branch.
- I verified the current live slide/image mapping directly from Supabase through `cms.loadPresentation('10_percent_lifestyle')`.

### 2. Frozen Static Package

This is the locally saved pilot package:
- [pilot-presentation](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/pilot-presentation)

Key files:
- Manifest: [pilot-presentation/manifest.json](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/pilot-presentation/manifest.json)
- Generated audio: [pilot-presentation/audio](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/pilot-presentation/audio)

### 3. Runtime Session Storage

Local DB:
- [data/voice-ppt.db](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/data/voice-ppt.db)

What it stores:
- sessions
- current slide position
- session metadata
- slide rows copied into runtime
- events / analytics-related runtime records

## Source Presentation Hierarchy

The canonical source deck currently has `7` main slides.

Authoritative source for this section:
- Supabase presentation `10_percent_lifestyle`

Verified live metadata:
- Source: `supabase`
- Project slug: `76a124f9-0a4b-42cf-9984-ae68ebbb91ff`
- Title: `The 10% Life`
- Slide count: `7`

### Source Slides

| # | ID | Title | Image |
|---|---|---|---|
| 1 | `supabase-slide-1` | `You've been running at 100%.` | `https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PBR_0209.jpg` |
| 2 | `supabase-slide-2` | `What if 10% was enough?` | `https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PBR_0814.jpg` |
| 3 | `supabase-slide-3` | `Seven years of quiet work.` | `https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PSX_20211216_190054.webp` |
| 4 | `supabase-slide-4` | `Rewilded landscapes by Beforest.` | `https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_4.jpeg` |
| 5 | `clarity` | `300 Nights of Intentional Living.` | `https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_24.png` |
| 6 | `supabase-slide-6` | `The weight of 'Next Year'.` | `https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_20.jpeg` |
| 7 | `supabase-slide-7` | `Blyton Bungalow: The First 1%.` | `https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_39.png` |

### Live Source Notes

Slide notes currently verified from Supabase:

1. `You've been running at 100%.`
   `Hold up the mirror. Name the exhaustion of the urban trap. The average professional spends less than 2% outdoors.`
2. `What if 10% was enough?`
   `Explain the 10% solution: 30 nights annually. A practice, not a holiday. The math of transformation.`
3. `Seven years of quiet work.`
   `Six collectives. 1,300 acres. 250 families. Seven years. Each number as its own sentence. Regeneration, not development.`
4. `Rewilded landscapes by Beforest.`
   `Showcase the sanctuaries. Ancient forests, coffee plantations, grasslands. Not amenities — transformation.`
5. `300 Nights of Intentional Living.`
   `Address objections directly. Person-nights, not family nights. Frame it as a recurring reset practice.`
6. `The weight of 'Next Year'.`
   `Move away from sales urgency. Focus on the personal cost of waiting. Calibration and reset are needed now, not eventually.`
7. `Blyton Bungalow: The First 1%.`
   `Details: Hospitality without the footprint. 6 signature rooms in Poomaale 1.0 where we are conserving 60 million liters of water. A place where 90-point coffee is grown. The pilot, not the backup plan. Every rupee of the trial stay will be adjusted towards membership.`

## Frozen Static Presentation Hierarchy

The saved pilot package currently has `10` slides total:
- `7` presentation slides
- `3` quote slides

### Frozen Static Sequence

| Seq | Kind | Title / Quote | Image |
|---|---|---|---|
| 1 | Presentation | `Full calendars do not make full lives.` | `https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PBR_0209.jpg` |
| 2 | Quote | Quote interstitial | No image, brand background |
| 3 | Presentation | Slide 2 equivalent | See [pilot-presentation/manifest.json](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/pilot-presentation/manifest.json) |
| 4 | Presentation | Slide 3 equivalent | See manifest |
| 5 | Quote | Quote interstitial | No image, brand background |
| 6 | Presentation | Slide 4 equivalent | See manifest |
| 7 | Presentation | Slide 5 equivalent | See manifest |
| 8 | Quote | Quote interstitial | No image, brand background |
| 9 | Presentation | Slide 6 equivalent | See manifest |
| 10 | Presentation | Slide 7 equivalent | See manifest |

## Interstitial Question Hierarchy

These are currently defined in [public/app.js](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/public/app.js).

### Interstitial 1

- After slide index: `2`
- ID: `depletion`
- Eyebrow: `A Quick Check`
- Prompt: `What feels most depleted right now?`
- Options:
  - `Time`
  - `Energy`
  - `Focus`
  - `Perspective`

### Interstitial 2

- After slide index: `6`
- ID: `change`
- Eyebrow: `A Clearer Lens`
- Prompt: `What would protected time change first?`
- Options:
  - `Sleep`
  - `Attention`
  - `Relationships`
  - `Decision-making`

### Interstitial 3

- After slide index: `8`
- ID: `readiness`
- Eyebrow: `One Last Question`
- Prompt: `Would you seriously consider a trial stay this season?`
- Options:
  - `Yes`
  - `Possibly`
  - `Need more clarity`
  - `Not now`

## Current End State / CTA Hierarchy

Current end-state UI is defined primarily in:
- [public/index.html](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/public/index.html)
- [public/app.js](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/public/app.js)

Current CTA behavior:
- Hero image is chosen randomly from the presentation slide image pool
- Completion eyebrow: `The First Real Step`
- Completion title in pilot-style CTA: `Start Your Trial`
- Main CTA label: `Take the trial stay`
- Main CTA destination: `https://hospitality.beforest.co`

## Current Runtime Flow On This Branch

### Default Experience

This branch currently defaults to:
- `realtime`

That means:
- user lands on the main presentation shell
- session starts from `/api/session/start`
- current slide deck loads from session/runtime context
- spoken narration and spoken Q&A are requested through `/api/voice-lite/*`
- on this branch, `/api/voice-lite/*` now tries Gemini Live first
- current fallback path is still the older model+TTS path if Gemini Live is unavailable

### Start Flow

1. Start screen loads.
2. User selects / resolves the current presentation.
3. Session starts via `/api/session/start`.
4. App enters `realtimeNarrationMode`.
5. First slide is primed.
6. Slides are loaded into the main shell.
7. Voice path starts through `/api/voice-lite/narrate`.

### Narration Flow

1. Current slide context is loaded from the session.
2. Voice route builds a narration prompt grounded in:
   - slide title
   - visible content
   - slide notes
   - project knowledge context
3. Gemini Live is used first for audio output.
4. Returned transcript text is shown in the transcript reel.
5. Returned audio is played in the current presentation shell.

### Q&A Flow

1. User holds mic / space to interrupt.
2. Browser speech recognition captures the spoken question.
3. Transcribed text is sent to `/api/voice-lite/ask`.
4. The backend builds a grounded answer prompt from:
   - current slide
   - current slide notes
   - project docs
5. Gemini Live returns spoken answer audio plus transcript text.
6. The same presenter voice answers inside the current shell.

### Continue / Advance Flow

1. Slide narration finishes.
2. App enters a paused `Your turn` / continue state.
3. User can:
   - continue to next slide
   - interrupt with a question
   - use history / scrubber to inspect slides
4. When continuing:
   - app advances slide index
   - syncs current slide position to session state
   - requests next narration turn

### Completion Flow

1. Last slide finishes.
2. Completion overlay opens.
3. A full-bleed hero image is shown.
4. Summary copy is rendered.
5. CTA block points to `https://hospitality.beforest.co`
6. Q&A widget remains available from the completion state

## Current Route / Mode Summary

- Main route: `/`
  - current default on this branch: realtime experience
- Testing hooks:
  - `/?state=end`
  - `/?slide=1`
  - `/?slide=5`
  - `/?slide=last`
  - optional `&autoplay=true`
- Static pilot package route still exists in the codebase:
  - `/pilot-package/manifest.json`

## Current Important Technical Reality

- The canonical business content is Supabase-backed
- The local project package mirrors the same structure for brownfield stability
- The frozen pilot package is a local saved artifact, not the primary source of truth on this branch
- The current realtime branch now uses Gemini Live as the first voice engine through the existing voice-lite API seam
- Latency is still materially high, so the architecture is integrated but not yet polished

## Best Single Places To Inspect Next

- Source presentation: [content/projects/beforest/presentations/10_percent_lifestyle.json](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/content/projects/beforest/presentations/10_percent_lifestyle.json)
- Frozen static package: [pilot-presentation/manifest.json](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/pilot-presentation/manifest.json)
- Runtime UI flow: [public/app.js](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/public/app.js)
- Live voice backend: [server/routes/voiceLite.js](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/server/routes/voiceLite.js)
- Gemini Live session manager: [server/services/geminiLive.js](/home/harsha-mudumba/ai_projects/ai-ppt-predictive-17april26/voice-ppt-simple/server/services/geminiLive.js)
