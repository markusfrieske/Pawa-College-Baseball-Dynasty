/** Purpose-built filled navigation silhouettes with open negative space at 18–20px. */
const paths: Record<string, string> = {
  Hub: "M12 2 2 10v11h7v-7h6v7h7V10L12 2Z",
  Recruit: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z",
  Games: "M6 2h2v3h8V2h2v3h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V2Zm-2 9v9h16v-9H4Zm3 2h4v4H7v-4Z",
  Roster: "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 13c-4.2 0-7 2.3-7 6v2h14v-2c0-3.7-2.8-6-7-6Zm8-1.5c-.7 0-1.3.1-1.9.3 2.4 1.6 3.9 4.1 3.9 7.2v2h3v-3c0-3.7-2.1-6.5-5-6.5Z",
  More: "M3 5h18v3H3V5Zm0 6h18v3H3v-3Zm0 6h18v3H3v-3Z",
  Stats: "M3 13h4v8H3v-8Zm7-5h4v13h-4V8Zm7-5h4v18h-4V3Z",
  Storylines: "M11 2 14 9 21 12 14 15 11 22 8 15 1 12 8 9 11 2Zm8-1 1.2 3.8L24 6l-3.8 1.2L19 11l-1.2-3.8L14 6l3.8-1.2L19 1Z",
  Records: "M2 3h6c1.7 0 3 .6 4 1.6C13 3.6 14.3 3 16 3h6v17h-6c-1.7 0-3 .6-4 1.6C11 20.6 9.7 20 8 20H2V3Zm9 4v11h2V7h-2ZM5 7v2h4V7H5Zm10 0v2h4V7h-4ZM5 12v2h4v-2H5Zm10 0v2h4v-2h-4Z",
  Archive: "M2 3h20v5H2V3Zm2 7h16v12H4V10Zm5 3v3h6v-3H9Z",
  Inbox: "M5 3h14l4 11v7H1v-7L5 3Zm1.5 3L4 13h5l1.5 3h3l1.5-3h5l-2.5-7h-11Z",
  Commissioner: "M12 1 22 5v7c0 5-4 9-10 12C6 21 2 17 2 12V5l10-4Zm4.3 6.3L10 13.6l-3.3-3.3-2.1 2.1L10 17.8l8.4-8.4-2.1-2.1Z",
};
const aliases: Record<string, string> = {
  Today: "Hub", Recruiting: "Recruit", Schedule: "Games", "Record book": "Records", "Coach inbox": "Inbox",
};

export function VarsityIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const path = paths[aliases[name] || name];
  if (!path) return null;
  return <svg width={size} height={size} className={className} style={{ flexShrink: 0 }} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d={path} fillRule="evenodd" />
  </svg>;
}
