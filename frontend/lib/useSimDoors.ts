"use client";
// The run controls' calls to the simulation doors (clock, AI switch, scenarios, runs), shared by the classic top bar
// and the City's top bar so the door logic lives once. Every call goes to a backend door; nothing here decides anything.

import { useEffect, useState } from "react";
import { api, Live, Scenario } from "./api";

export function useSimDoors(live: Live | null, { onChanged, onError, onReport }: {
  onChanged: (reset?: boolean) => void; onError: (message: string) => void; onReport: (runId: number | null) => void;
}) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [chosen, setChosen] = useState("MANUAL");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Scenario[]>("/simulation/scenarios").then(setScenarios).catch(() => setScenarios([]));
  }, []);

  async function act(path: string, body: unknown = {}, reset = false) {
    setBusy(true);
    try {
      await api.post(path, body);
      onChanged(reset);
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const playing = live?.clock.status === "RUNNING";
  return {
    scenarios, chosen, setChosen, busy, playing,
    play: () => act("/simulation/clock/play"),
    pause: () => act("/simulation/clock/pause"),
    nextHour: () => act("/simulation/clock/next-hour"),
    nextDay: () => act("/simulation/clock/next-day"),
    toggleAi: () => act("/simulation/settings", { ai_enabled: live?.ai_enabled ? 0 : 1 }),
    async finishRun(runId: number) {
      if (await act(`/simulation/runs/${runId}/finish`)) onReport(runId);
    },
    /** A fresh start: finish the run still open (its report is kept), then restore the scenario's starting state. */
    async startScenario() {
      if (live?.run && !(await act(`/simulation/runs/${live.run.id}/finish`))) return;
      await act(`/simulation/scenarios/${chosen}/start`, { seed: 1 }, true);
    },
  };
}
