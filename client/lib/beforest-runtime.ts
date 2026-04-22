import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildOpeningPrompt,
  buildSystemInstruction,
  type BeforestVisual,
  type KnowledgeChunk,
  searchKnowledge,
  selectImage,
} from "./beforest-shared";

const ROOT = path.resolve(process.cwd(), "..", "server", "content");
const KNOWLEDGE_ROOT = path.join(ROOT, "knowledge");
const IMAGES_PATH = path.join(ROOT, "images", "images.json");
async function loadKnowledgeFiles() {
  const files = [
    "brand.md",
    "cta.md",
    "design.md",
    "flow.md",
    "product.md",
    "transcript.md",
  ];

  const entries = await Promise.all(
    files.map(async (fileName) => {
      const content = await readFile(path.join(KNOWLEDGE_ROOT, fileName), "utf8");
      return { fileName, content };
    }),
  );

  return entries;
}

function chunkMarkdown(source: string, content: string): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  let currentHeading = "Overview";
  let paragraphBuffer: string[] = [];

  const flush = () => {
    const text = paragraphBuffer.map((line) => line.trim()).filter(Boolean).join(" ").trim();
    paragraphBuffer = [];
    if (!text) {
      return;
    }
    chunks.push({
      source,
      section: currentHeading,
      content: text,
    });
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith("#")) {
      flush();
      currentHeading = line.replace(/^#+\s*/, "").trim() || "Overview";
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    paragraphBuffer.push(line);
  }

  flush();
  return chunks;
}

export async function loadKnowledgeChunks() {
  const files = await loadKnowledgeFiles();
  return files.flatMap(({ fileName, content }) => chunkMarkdown(fileName.replace(/\.md$/, ""), content));
}

export async function loadCuratedImages() {
  const raw = await readFile(IMAGES_PATH, "utf8");
  const items = JSON.parse(raw) as Array<{
    id: string;
    title: string;
    path: string;
    hook: string;
    note: string;
    alt?: string;
    tags?: string[];
    best_for?: string[];
  }>;

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    imageUrl: item.path,
    hook: item.hook,
    note: item.note,
    alt: item.alt || item.title,
    tags: item.tags || [],
    bestFor: item.best_for || [],
  })) satisfies BeforestVisual[];
}

export function getInitialVisual(images: BeforestVisual[]) {
  return (
    images.find((image) => image.id === "opening-forest-road") || images[0]
  );
}

export { buildOpeningPrompt, buildSystemInstruction, searchKnowledge, selectImage };
