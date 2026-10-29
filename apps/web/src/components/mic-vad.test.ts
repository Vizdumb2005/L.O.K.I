import { describe, expect, it } from "vitest";
import { MicVad, rmsToDb } from "./mic-vad.js";

describe("rmsToDb", () => {
  it("maps 1 to 0 dBFS and floors tiny values", () => {
    expect(rmsToDb(1)).toBe(0);
    expect(rmsToDb(0.01)).toBeCloseTo(-40, 1);
    expect(rmsToDb(0)).toBeCloseTo(-120, 0);
  });
});

describe("MicVad", () => {
  it("stays quiet in a silent room and learns the floor", () => {
    const vad = new MicVad();
    let state = vad.update(-50, 0);
    for (let t = 100; t <= 20000; t += 100) state = vad.update(-50, t);
    expect(state.active).toBe(false);
    expect(state.floorDb).toBeCloseTo(-50, 0);
  });

  it("trips on a clear burst above the floor and releases after the hangover", () => {
    const vad = new MicVad();
    for (let t = 0; t <= 20000; t += 100) vad.update(-50, t);
    let state = vad.update(-30, 20100);
    expect(state.active).toBe(true);
    // Still active during a brief dip (hangover).
    state = vad.update(-50, 20300);
    expect(state.active).toBe(true);
    expect(state.phase).toBe("settling"); // hangover is labelled, not hidden
    // Released once the hangover has passed.
    state = vad.update(-50, 20100 + 100 + 460);
    expect(state.active).toBe(false);
    expect(state.phase).toBe("quiet");
  });

  it("does not let the floor chase a sustained loud sound while active", () => {
    const vad = new MicVad();
    for (let t = 0; t <= 20000; t += 100) vad.update(-50, t);
    const floorAtOnset = vad.update(-30, 20100).floorDb;
    for (let t = 20200; t <= 24000; t += 100) vad.update(-30, t);
    const state = vad.update(-30, 24100);
    expect(state.active).toBe(true);
    expect(state.floorDb).toBe(floorAtOnset);
  });

  it("adapts slowly when the room itself gets louder while quiet", () => {
    const vad = new MicVad();
    for (let t = 0; t <= 20000; t += 100) vad.update(-50, t);
    // Room gets 6 dB louder (a fan starts): below the 12 dB margin, so no activity,
    // and the floor rises toward the new normal.
    let state = vad.update(-44, 20100);
    expect(state.active).toBe(false);
    for (let t = 20200; t <= 40000; t += 100) state = vad.update(-44, t);
    expect(state.active).toBe(false);
    expect(state.floorDb).toBeCloseTo(-44, 0);
  });
});
