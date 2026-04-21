import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { GoogleGenAI, Modality } from '@google/genai';
import { beforestBrandRules, presentationSlides, presentationTitle } from './presentation-content';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const model = 'gemini-3.1-flash-live-preview';
const isProduction = process.env.NODE_ENV === 'production';
const authCookieName = 'beforest_auth';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

function buildPresentationSystemInstruction() {
  const slideOutline = presentationSlides
    .map(
      (slide, index) =>
        `Slide ${index + 1}: ${slide.title}\nNote: ${slide.note}\nApproved spoken context: ${slide.script}\nImage: ${slide.imageUrl}`,
    )
    .join('\n\n');

  return `
You are the live presentation guide for "${presentationTitle}" by Beforest.

Brand and agent rules:
${beforestBrandRules}

Approved slide sequence:
${slideOutline}

Behavior rules:
- Stay inside this presentation only.
- When asked to narrate a slide, speak only about that slide, its note, and its approved spoken context.
- Keep slide narration around 20 to 30 seconds unless the user asks to go deeper.
- Sound human and grounded, not synthetic. Use light natural spoken rhythm, brief pauses, and occasional gentle hesitations only when it feels organic.
- Never overdo filler words. Avoid theatrical acting, exaggerated disfluencies, or anything sloppy.
- Prefer clarity over poetry. Be concrete, direct, and easy to follow.
- Especially at the beginning, explain things like a thoughtful person would: what this is, why it matters, where it is going, and how the listener can interact.
- When answering a user question, answer from the current slide first, then from other approved slides only if necessary.
- If the answer is not grounded in these slides and rules, say you do not have an approved answer yet.
- Do not invent operational details, pricing math, or new claims.
- At the end of each narrated slide, briefly ask if they have a question and mention the controls naturally:
  desktop: hold space to ask, then release
  mobile: hold the mic to ask, then release
- If there is no interruption, be ready for the client to continue automatically into the next slide.
- On the final CTA slide, guide the listener to book a trial stay at https://hospitality.beforest.co.
- End the final CTA narration with: You decide with your feet, not your eyes. See you in the slow lane.
- No markdown, no bullet lists, no labels, no stage directions.
`.trim();
}

function requireApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in environment.');
  }
  return apiKey;
}

function requirePasscode() {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) {
    throw new Error('Missing APP_PASSCODE in environment.');
  }
  return passcode;
}

function createAuthToken(passcode: string) {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

function isAuthenticated(req: express.Request) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) {
    return true;
  }

  return req.cookies?.[authCookieName] === createAuthToken(passcode);
}

function authRequired(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (isAuthenticated(req)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized.' });
}

function createServerAi() {
  return new GoogleGenAI({
    apiKey: requireApiKey(),
    httpOptions: { apiVersion: 'v1alpha' },
  });
}

app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: isAuthenticated(req),
    enabled: Boolean(process.env.APP_PASSCODE),
  });
});

app.post('/api/auth/login', (req, res) => {
  try {
    const expectedPasscode = requirePasscode();
    const providedPasscode =
      typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';

    if (!providedPasscode || providedPasscode !== expectedPasscode) {
      return res.status(401).json({ error: 'Invalid passcode.' });
    }

    res.cookie(authCookieName, createAuthToken(expectedPasscode), {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    return res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to login.';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(authCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
  });

  res.json({ ok: true });
});

app.get('/api/live-token', authRequired, async (_req, res) => {
  try {
    const ai = createServerAi();
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const requestedVoice =
      typeof _req.query.voiceName === 'string' && _req.query.voiceName.trim()
        ? _req.query.voiceName.trim()
        : 'Zephyr';

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: buildPresentationSystemInstruction(),
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: requestedVoice,
                },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: true,
              },
            },
          },
        },
      },
    });

    res.json({
      token: token.name,
      model,
      voiceName: requestedVoice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create live token.';
    res.status(500).json({ error: message });
  }
});

app.get('/api/presentation', authRequired, (_req, res) => {
  res.json({
    title: presentationTitle,
    slides: presentationSlides,
  });
});

app.post('/api/question-route', authRequired, async (req, res) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const currentSlideId =
      typeof req.body?.currentSlideId === 'string' ? req.body.currentSlideId.trim() : '';

    if (!question || !currentSlideId) {
      return res.status(400).json({ error: 'Missing question or currentSlideId.' });
    }

    const currentSlide = presentationSlides.find((slide) => slide.id === currentSlideId);
    if (!currentSlide) {
      return res.status(404).json({ error: 'Current slide not found.' });
    }

    const slideSummary = presentationSlides
      .map(
        (slide, index) =>
          `${index + 1}. id=${slide.id}; title=${slide.title}; note=${slide.note}; script=${slide.script}; imageUrl=${slide.imageUrl}`,
      )
      .join('\n');

    const ai = new GoogleGenAI({ apiKey: requireApiKey() });
    const routeResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
You are a presentation routing helper for a Beforest deck.
Use only the approved slides below. Never invent facts or image URLs.

Brand rules:
${beforestBrandRules}

Current slide:
id=${currentSlide.id}
title=${currentSlide.title}
note=${currentSlide.note}
script=${currentSlide.script}

Approved slides:
${slideSummary}

User question:
${question}

Return strict JSON only with one of these actions:
{
  "action": "stay" | "goto" | "derived",
  "targetSlideId": "existing slide id or null",
  "derivedTitle": "short title or null",
  "derivedNote": "1-2 sentence approved explanation or null",
  "imageFromSlideId": "existing slide id for image source or null"
}

Rules:
- Use "stay" if the current slide is enough.
- Use "goto" if another existing slide is clearly a better visual/context anchor.
- Use "derived" only if the question deserves a temporary custom slide synthesized from the approved deck.
- For "derived", the note must be grounded in the approved slides only.
- For "goto", set targetSlideId.
- For "stay", all extra fields should be null.
`.trim(),
    });

    const parsed = safeParseJson<{
      action: 'stay' | 'goto' | 'derived';
      targetSlideId: string | null;
      derivedTitle: string | null;
      derivedNote: string | null;
      imageFromSlideId: string | null;
    }>(routeResponse.text ?? '');

    if (!parsed?.action) {
      return res.status(502).json({ error: 'Could not parse question route response.' });
    }

    res.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to route question.';
    res.status(500).json({ error: message });
  }
});

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

app.post('/api/compose', authRequired, async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt.' });
    }

    const ai = new GoogleGenAI({ apiKey: requireApiKey() });

    const outlineResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Create a minimalist presentation visual plan for this spoken prompt: "${prompt}".
Return strict JSON with:
{
  "title": "2 to 5 words",
  "imagePrompt": "cinematic but minimal image direction, no text overlays"
}`,
    });

    const outline = safeParseJson<{ title: string; imagePrompt: string }>(
      outlineResponse.text ?? '',
    );

    if (!outline?.title || !outline?.imagePrompt) {
      return res.status(502).json({ error: 'Could not parse compose response.' });
    }

    const imageResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: outline.imagePrompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    const imagePart = imageResponse.candidates?.[0]?.content?.parts?.find(
      (part) => Boolean(part.inlineData?.data),
    );

    if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
      return res.status(502).json({ error: 'Image generation returned no image.' });
    }

    res.json({
      title: outline.title,
      imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to compose visual.';
    res.status(500).json({ error: message });
  }
});

if (isProduction) {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
