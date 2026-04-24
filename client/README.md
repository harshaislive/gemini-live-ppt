# Beforest Gemini Client

A Next.js application for the Beforest editorial voice experience on direct Gemini Live.

## Features

- **Real-time conversation** with Gemini Live directly from the browser
- **Full-bleed editorial image stage** driven by agent RPC
- **Tap-to-speak microphone UX** with direct audio capture and send
- **Live subtitles** fed by Gemini transcription events
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

The app uses `client/app/api/gemini-live-token/route.ts` to mint ephemeral Live API auth tokens for direct browser connections.

### Required Variables

Set your Gemini credentials in `.env.local`:

```bash
GOOGLE_API_KEY=...
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
PRESENTATION_PASSCODE=
```

## Usage

1. **Connect** to establish a Gemini Live session
2. **Listen** as the opening 10% narrative begins automatically
3. **Hold the mic** to interrupt and ask grounded product questions
4. **Watch the image stage** update when Gemini uses `show_curated_image`
5. **Follow the subtitle ribbon** for the latest spoken words

## Mobile Support

The layout remains mobile-safe. The current branch focuses on voice, visuals, and subtitles rather than screen sharing.

## Tech Stack

- **Next.js 15.5.4** with React 19.1.0
- **Google GenAI JavaScript SDK**
- **Tailwind CSS 4** for styling
- **Lucide React** for icons
