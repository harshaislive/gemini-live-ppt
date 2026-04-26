import { GoogleGenAI } from "@google/genai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PREPARED_FAQS } from "../app/presentationScript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(CLIENT_ROOT, "..");
const OUT_DIR = path.join(CLIENT_ROOT, "public", "audio", "faq");
const SAMPLE_RATE = 24000;

function parseDotEnv(content: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function loadEnv() {
  const envPaths = [
    path.join(REPO_ROOT, ".env"),
    path.join(CLIENT_ROOT, ".env.local"),
    path.join(CLIENT_ROOT, ".env"),
  ];
  for (const envPath of envPaths) {
    try {
      parseDotEnv(await readFile(envPath, "utf8"));
    } catch {
      // Optional env file.
    }
  }
}

function wavHeader(dataLength: number, sampleRate = SAMPLE_RATE, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

function pcmToWav(pcm: Buffer) {
  return Buffer.concat([wavHeader(pcm.length), pcm]);
}

function audioFileName(audioUrl: string) {
  return path.basename(audioUrl);
}

async function main() {
  await loadEnv();
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is missing. Add it to .env or client/.env.local.");
  }

  const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const voiceName = process.env.GOOGLE_VOICE_ID || process.env.NEXT_PUBLIC_GOOGLE_VOICE_ID || "Gacrux";
  const ai = new GoogleGenAI({ apiKey });
  await mkdir(OUT_DIR, { recursive: true });

  for (const faq of PREPARED_FAQS) {
    const outPath = path.join(OUT_DIR, audioFileName(faq.audioUrl));
    const contents = `${faq.question}. ${faq.answer}`.replaceAll("%", " percent");

    console.log(`Generating ${path.relative(CLIENT_ROOT, outPath)} with ${voiceName}...`);
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
    });

    const data = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData?.data;
    if (!data) {
      throw new Error(`No audio returned for ${faq.id}`);
    }
    await writeFile(outPath, pcmToWav(Buffer.from(data, "base64")));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
