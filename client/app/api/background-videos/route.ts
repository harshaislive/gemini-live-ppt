import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const VIDEO_DIRECTORY = path.join(process.cwd(), "public", "videos");
const FALLBACK_VIDEOS = ["/videos/beforest-10-percent-live-720.mp4"];
const SUPPORTED_VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const EXCLUDED_VIDEO_PATTERNS = [
  /-1080\.mp4$/i,
  /IMG_0928-720\.mp4$/i,
];

export async function GET() {
  try {
    const files = await readdir(VIDEO_DIRECTORY);
    const videos = files
      .filter((file) => SUPPORTED_VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .filter((file) => EXCLUDED_VIDEO_PATTERNS.every((pattern) => !pattern.test(file)))
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
      .map((file) => `/videos/${file}`);

    return NextResponse.json({
      videos: videos.length ? videos : FALLBACK_VIDEOS,
    });
  } catch {
    return NextResponse.json({ videos: FALLBACK_VIDEOS });
  }
}
