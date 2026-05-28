import { useEffect } from "react";

const HEARTBEAT_MS = 30_000;

function getOrCreateToken(): string {
  const key = "cbd_presence_token";
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

export function usePresence() {
  useEffect(() => {
    const token = getOrCreateToken();

    const beat = () => {
      fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "include",
      }).catch(() => {});
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);
}
