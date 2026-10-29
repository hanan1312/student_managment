import { useEffect, useRef } from "react";

const CHANNEL_NAME = "school-app-sync";

let channel: BroadcastChannel | null = null;
let unsupported = false;

function getChannel(): BroadcastChannel | null {
  if (unsupported) return null;
  if (typeof BroadcastChannel === "undefined") {
    unsupported = true;
    return null;
  }
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export type SyncScope = "students";

export function broadcastChange(scope: SyncScope) {
  getChannel()?.postMessage({ scope, at: Date.now() });
}

export function useSyncListener(scope: SyncScope, onChange: () => void) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.scope === scope) cbRef.current();
    };
    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  }, [scope]);
}
