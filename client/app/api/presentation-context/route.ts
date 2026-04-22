import { NextRequest, NextResponse } from "next/server";
import {
  buildOpeningPrompt,
  getInitialVisual,
  loadCuratedImages,
  loadKnowledgeChunks,
} from "@/lib/beforest-runtime";

const ACCESS_COOKIE = "beforest_presentation_access";
const PASSCODE = process.env.PRESENTATION_PASSCODE?.trim() || "";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (PASSCODE && req.cookies.get(ACCESS_COOKIE)?.value !== "granted") {
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
