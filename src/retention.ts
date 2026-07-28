type DatedRecord = {
  date: string;
};

export function partitionSessionsByRetention<T extends DatedRecord>(
  sessions: T[],
  retentionDays: number,
  now = new Date(),
) {
  const safeRetentionDays = Math.max(1, Math.floor(retentionDays));
  const cutoff = now.getTime() - safeRetentionDays * 24 * 60 * 60 * 1_000;
  const retained: T[] = [];
  const expired: T[] = [];

  for (const session of sessions) {
    const timestamp = Date.parse(session.date);
    if (Number.isFinite(timestamp) && timestamp < cutoff) {
      expired.push(session);
    } else {
      retained.push(session);
    }
  }

  return { retained, expired, cutoff: new Date(cutoff) };
}

export function partitionSessionsAndDraftByRetention<T extends DatedRecord & { id: string }>(
  sessions: T[],
  draft: T | null,
  retentionDays: number,
  now = new Date(),
) {
  const candidates =
    draft && !sessions.some((session) => session.id === draft.id)
      ? [...sessions, draft]
      : sessions;
  return partitionSessionsByRetention(candidates, retentionDays, now);
}
