# Beforest Controlled Narrator Client

A Next.js application for the Beforest editorial voice experience: committed narration audio first, Gemini Live only for interruptions.

## Features

- **Instant narration** from committed WAV chunks in `public/audio/narration`
- **Real-time interruption answers** with Gemini Live directly from the browser
- **Full-bleed editorial image stage** driven by chunk metadata
- **Tap-to-speak microphone UX** with direct audio capture and send
- **Transcript subtitles** from chunk metadata, plus Gemini transcription during interruptions
- **Beforest-specific visual shell** using the existing Arizona fonts and palette

## Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment**:

   ```bash
   cp env.example .env.local
   # Edit .env.local with your Gemini API key and optional passcode
   ```

3. **Start development server**:

   ```bash
   npm run dev
   ```

   The dev server binds to `0.0.0.0`, so you can reach it from Tailscale or another device on your network. It also respects `PORT`, for example `PORT=18789 npm run dev`.

4. **Open** [http://localhost:3000](http://localhost:3000), or if you are using Tailscale Serve/Funnel, run on the proxied port and open your Tailscale hostname URL.

## Configuration

### Local Development

The app starts from static narrator chunks in `app/presentationScript.ts`. It uses `client/app/api/gemini-live-token/route.ts` to mint ephemeral Live API auth tokens only when the listener taps the mic.

### Required Variables

Set your Gemini credentials in `.env.local`:

```bash
GOOGLE_API_KEY=...
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
PRESENTATION_PASSCODE=
```

## Usage

1. **Begin walkthrough** to play the static narrator immediately
2. **Listen** as the video loops until each narration chunk completes
3. **Tap the mic** to pause narration and ask grounded product questions
4. **Watch the image stage** advance from chunk metadata
5. **Tap again** to close the question; Gemini answers and narration resumes

## Narration

Regenerate committed WAV snippets after editing `app/presentationScript.ts`:

```bash
npm run generate:narration
```

## Mobile Support

The layout remains mobile-safe. The current branch focuses on voice, visuals, and subtitles rather than screen sharing.

## Tech Stack

- **Next.js 15.5.4** with React 19.1.0
- **Google GenAI JavaScript SDK**
- **Tailwind CSS 4** for styling
- **Lucide React** for icons
