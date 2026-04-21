# Beforest LiveKit Client

A Next.js application for the Beforest editorial voice experience on LiveKit Agents.

## Features

- **Real-time conversation** with Gemini via LiveKit Agents
- **Full-bleed editorial image stage** driven by agent RPC
- **Hold-to-talk microphone UX** on top of a LiveKit room session
- **Live subtitles** fed by room transcription events
- **Beforest-specific visual shell** using the existing Arizona fonts and palette

## Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment**:

   ```bash
   cp env.example .env.local
   # Edit .env.local with your LiveKit project values
   ```

3. **Start development server**:

   ```bash
   npm run dev
   ```

4. **Open** [http://localhost:3000](http://localhost:3000) and click **Begin live walkthrough**

## Configuration

### Local Development

The app uses `client/app/api/token/route.ts` to mint a development token against your LiveKit project and dispatch the configured agent.

### Required Variables

Set your LiveKit credentials in `.env.local`:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
NEXT_PUBLIC_LIVEKIT_AGENT_NAME=beforest-guide
NEXT_PUBLIC_LIVEKIT_FRONTEND_IDENTITY=frontend
```

## Usage

1. **Connect** to establish a LiveKit session with the agent
2. **Listen** as the opening 10% narrative begins automatically
3. **Hold the mic** to interrupt and ask grounded product questions
4. **Watch the image stage** update when the agent calls `show_curated_image`
5. **Follow the subtitle ribbon** for the latest spoken words

## Mobile Support

The layout remains mobile-safe. The current branch focuses on voice, visuals, and subtitles rather than screen sharing.

## Tech Stack

- **Next.js 15.5.4** with React 19.1.0
- **LiveKit client SDK** and **LiveKit React components**
- **Tailwind CSS 4** for styling
- **Lucide React** for icons
