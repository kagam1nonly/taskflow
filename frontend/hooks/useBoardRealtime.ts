"use client";

import { useEffect } from "react";

type RealtimeEvent = {
  type: string;
  payload: unknown;
};

function getWebSocketBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) {
    return explicit;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
  const withoutApi = apiBase.replace(/\/api\/?$/, "");
  return withoutApi.replace("http://", "ws://").replace("https://", "wss://");
}

export function useBoardRealtime(
  boardId: string | null,
  onEvent: (event: RealtimeEvent) => void,
): void {
  useEffect(() => {
    if (!boardId) {
      return;
    }

    const wsBase = getWebSocketBaseUrl();
    const ws = new WebSocket(`${wsBase}/ws/boards/${boardId}`);

    ws.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as RealtimeEvent);
      } catch {
        // Ignore invalid payloads.
      }
    };

    return () => {
      ws.close();
    };
  }, [boardId, onEvent]);
}
