import { NextRequest, NextResponse } from "next/server";
import {
  buildOpeningPrompt,
  getInitialVisual,
  loadCuratedImages,
  loadKnowledgeChunks,
} from "@/lib/beforest-runtime";
import { getServerEnv } from "@/lib/server-env";

const ACCESS_COOKIE = "beforest_presentation_access";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const passcode = getServerEnv("PRESENTATION_PASSCODE")?.trim() || "";
  if (passcode && req.cookies.get(ACCESS_COOKIE)?.value !== "granted") {
    return new NextResponse("Presentation access is locked.", { status: 401 });
  }

  const [images, chunks] = await Promise.all([loadCuratedImages(), loadKnowledgeChunks()]);

  return NextResponse.json({
    initialVisual: getInitialVisual(images),
    images,
    knowledgeChunks: chunks,
    openingPrompt: buildOpeningPrompt(),
  });
}
