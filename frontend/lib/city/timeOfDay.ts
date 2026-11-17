// Time-of-day looks (FE-20, FE-24): only a look; agents, shifts and events never change with it.

export type TimeMode = "AUTO" | "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT" | "MIDNIGHT";
export type Look = Exclude<TimeMode, "AUTO">;
export const TIME_MODES: TimeMode[] = ["AUTO", "MORNING", "AFTERNOON", "EVENING", "NIGHT", "MIDNIGHT"];

/** Sun height and direction (degrees), sun / sky / ground colours and strengths, background, how much night it is
 *  (0 day … 1 night: lit windows glow by this amount) and whether the street lamps are on (Evening, Night, Midnight). */
export type Preset = { elev: number; az: number; sun: string; sunI: number; sky: string; ground: string; hemiI: number;
  bg: string; night: number; lamps: 0 | 1 };

export const PRESETS: Record<Look, Preset> = {
  MORNING: { elev: 16, az: 70, sun: "#ffd3a6", sunI: 2.4, sky: "#d9e6ff", ground: "#efe2d2", hemiI: 1.15, bg: "#f4e9e1", night: 0, lamps: 0 },
  AFTERNOON: { elev: 58, az: 140, sun: "#ffffff", sunI: 2.6, sky: "#ffffff", ground: "#dfe5f4", hemiI: 1.6, bg: "#eef1f8", night: 0, lamps: 0 },
  EVENING: { elev: 7, az: 250, sun: "#ff9358", sunI: 1.9, sky: "#f4b9a6", ground: "#6d6296", hemiI: 0.85, bg: "#efb79e", night: 0.5, lamps: 1 },
  NIGHT: { elev: 40, az: 210, sun: "#9fb2ff", sunI: 0.45, sky: "#3a4c86", ground: "#151a33", hemiI: 0.55, bg: "#131b36", night: 1, lamps: 1 },
  MIDNIGHT: { elev: 50, az: 180, sun: "#7383d6", sunI: 0.22, sky: "#1d2550", ground: "#06070f", hemiI: 0.3, bg: "#070b19", night: 1, lamps: 1 },
};

/** Auto follows the viewer's real clock: 5–10 morning, 10–17 afternoon, 17–20 evening, 20–24 night, 0–5 midnight. */
export function resolveMode(mode: TimeMode, now = new Date()): Look {
  if (mode !== "AUTO") return mode;
  const h = now.getHours();
  if (h >= 5 && h < 10) return "MORNING";
  if (h >= 10 && h < 17) return "AFTERNOON";
  if (h >= 17 && h < 20) return "EVENING";
  if (h >= 20) return "NIGHT";
  return "MIDNIGHT";
}

export const parseTimeMode = (s: string | null | undefined): TimeMode | null => {
  const t = s?.toUpperCase();
  return t && (TIME_MODES as string[]).includes(t) ? (t as TimeMode) : null;
};
