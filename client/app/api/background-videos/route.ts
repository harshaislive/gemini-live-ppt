import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const VIDEO_DIRECTORY = path.join(process.cwd(), "public", "videos");
const FALLBACK_VIDEOS = ["/videos/beforest-10-percent-live-720.mp4"];
const FALLBACK_VIDEO_FILENAMES = new Set(FALLBACK_VIDEOS.map((video) => path.basename(video)));
const SUPPORTED_VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const OPTIMIZED_VIDEO_PATTERN = /-optimized\.(mp4|webm)$/i;
const PLAYLIST_EXCLUDED_VIDEO_FILENAMES = new Set(["final-slide-video-optimized.mp4"]);

export async function GET() {
  try {
    const files = await readdir(VIDEO_DIRECTORY);
    const videos = files
      .filter((file) => SUPPORTED_VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .filter((file) => !PLAYLIST_EXCLUDED_VIDEO_FILENAMES.has(file))
      .filter((file) => FALLBACK_VIDEO_FILENAMES.has(file) || OPTIMIZED_VIDEO_PATTERN.test(file))
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
      .map((file) => `/videos/${file}`);

    return NextResponse.json({
      videos: videos.length ? videos : FALLBACK_VIDEOS,
    });
  } catch {
    return NextResponse.json({ videos: FALLBACK_VIDEOS });
  }
}
