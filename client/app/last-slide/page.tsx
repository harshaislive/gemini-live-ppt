import type { Metadata } from "next";
import { ClientApp } from "../ClientApp";

export const metadata: Metadata = {
  title: "Last Slide Preview",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LastSlidePreview() {
  return <ClientApp previewChunkId="decision_close" />;
}
