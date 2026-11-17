// What the City says about its link to the backend. The picture always stays on the last good snapshot; this only
// tells the user how fresh it is, so a stale picture is never mistaken for the live state (FE-12).

export type Connection =
  | { kind: "connecting"; text: string }
  | { kind: "live" }
  | { kind: "offline"; text: string };

/** `error`: the last poll's error, or null when it succeeded. `updatedAt`: when the last good snapshot arrived. */
export function connectionOf(error: string | null, updatedAt: number | null, now: number): Connection {
  if (!error) return updatedAt === null ? { kind: "connecting", text: "Connecting to the backend…" } : { kind: "live" };
  if (updatedAt === null) return { kind: "offline", text: `Backend not reachable (${error}). Retrying…` };
  const s = Math.max(0, Math.round((now - updatedAt) / 1000));
  const age = s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`;
  return { kind: "offline", text: `Backend not reachable. Showing the last picture, from ${age} ago. Retrying…` };
}
