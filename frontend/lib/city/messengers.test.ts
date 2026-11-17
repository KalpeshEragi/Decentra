import { describe, expect, it } from "vitest";
import { makeLayout, onRoad, PLOTS } from "./cityLayout";
import { addMessengers, BATCH_MS, MAX_MESSENGERS, messengerAt, officeExit } from "./messengers";

const roads = makeLayout(10).roads;
const msg = (n: number, from = "PLANNING", to = "INVENTORY") => ({ key: `m${n}`, from, to, label: `offer ${n}` });

describe("addMessengers (FE-23)", () => {
  it("walks from the sender's office out through its gate, along the roads, in through the receiver's gate", () => {
    const [m] = addMessengers([], [msg(1, "SALES", "PURCHASING")], roads, 0);
    const out = officeExit("SALES"), into = officeExit("PURCHASING").reverse();
    expect(m.route.slice(0, out.length)).toEqual(out);
    expect(m.route.slice(-into.length)).toEqual(into);
    expect(out[out.length - 1][0]).toBe(PLOTS.SALES.gateX);
    for (const p of m.route.slice(out.length, -into.length)) expect(onRoad(roads, p[0], p[1])).toBe(true);
    const mid = messengerAt(m, m.t0 + m.ms / 2)!;
    expect(onRoad(roads, mid.x, mid.z)).toBe(true);
  });

  it("sets out one after another in real order, within about 15 s, at most a few at once", () => {
    const ms = addMessengers([], Array.from({ length: 10 }, (_, i) => msg(i)), roads, 0);
    expect(ms).toHaveLength(MAX_MESSENGERS);
    expect(ms.map((m) => m.key)).toEqual(["m4", "m5", "m6", "m7", "m8", "m9"]);
    ms.slice(1).forEach((m, i) => expect(m.t0).toBeGreaterThan(ms[i].t0));
    expect(ms[ms.length - 1].t0).toBeLessThan(BATCH_MS);
  });

  it("drops messengers that arrived and is not there before setting out", () => {
    const [m] = addMessengers([], [msg(1)], roads, 0);
    expect(messengerAt(m, -1)).toBeNull();
    expect(messengerAt(m, m.ms)).toBeNull();
    expect(addMessengers([m], [], roads, m.ms + 1)).toEqual([]);
  });
});
