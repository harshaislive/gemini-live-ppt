"use client";

import { WavMediaManager } from "@pipecat-ai/small-webrtc-transport";
import { PipecatAppBase } from "@pipecat-ai/voice-ui-kit";
import { useMemo } from "react";
import { ClientApp } from "./ClientApp";
import { useIsMobile } from "./hooks/useIsMobile";

export default function Home() {
  const isMobile = useIsMobile();
  const transportOptions = useMemo(
    () => ({
      mediaManager: new WavMediaManager(),
    }),
    [],
  );

  return (
    <PipecatAppBase
      transportType="smallwebrtc"
      startBotParams={{
        endpoint: "/api/start",
        requestData: {
          enableDefaultIceServers: true,
        },
      }}
      transportOptions={transportOptions}
      clientOptions={{
        enableCam: false,
        enableMic: true,
      }}
      noThemeProvider
    >
      {({ handleConnect, handleDisconnect, error }) => (
        <ClientApp
          connect={handleConnect}
          disconnect={handleDisconnect}
          isMobile={isMobile}
          error={error}
        />
      )}
    </PipecatAppBase>
  );
}
