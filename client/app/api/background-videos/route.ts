import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const VIDEO_DIRECTORY = path.join(process.cwd(), "public", "videos");
const FALLBACK_VIDEOS = ["/videos/beforest-10-percent-live-720.mp4"];

export async function GET() {
  try {
    const files = await readdir(VIDEO_DIRECTORY);
    const videos = files
      .filter((file) => file.toLowerCase().endsWith(".mp4"))
      .filter((file) => !/-1080\.mp4$/i.test(file))
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
      .map((file) => `/videos/${file}`);

    return NextResponse.json({
      videos: videos.length ? videos : FALLBACK_VIDEOS,
    });
  } catch {
    return NextResponse.json({ videos: FALLBACK_VIDEOS });
  }
}
