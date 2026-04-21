# Beforest bot server

Pipecat Gemini Live bot for the Beforest editorial presentation experience.

## Features
- Gemini Live speech-to-speech
- Daily WebRTC transport
- Approved markdown knowledge retrieval
- Curated image selection tool
- RTVI server messages for frontend visual updates

## Local run
```bash
cp env.example .env
uv sync
uv run bot.py --transport daily
```
