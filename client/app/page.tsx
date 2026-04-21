"use client";

import { ClientApp } from "./ClientApp";
import { useIsMobile } from "./hooks/useIsMobile";

export default function Home() {
  const isMobile = useIsMobile();

  return <ClientApp isMobile={isMobile} />;
}
