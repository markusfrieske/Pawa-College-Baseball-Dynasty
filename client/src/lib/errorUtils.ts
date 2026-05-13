export function parseErrorMessage(error: Error): string {
  const msg = error.message;
  const colonIdx = msg.indexOf(": ");
  if (colonIdx !== -1) {
    try {
      const parsed = JSON.parse(msg.slice(colonIdx + 2));
      if (parsed?.message) return String(parsed.message);
    } catch {
      // not JSON — fall through to raw message
    }
  }
  return msg;
}
