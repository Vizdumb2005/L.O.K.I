import { describe, expect, it } from "vitest";
import { verifySealedPrediction } from "@loki/effect-api";
import {
  CountdownForce,
  FORCED_POSITION,
  MAX_NUMBER,
  MIN_NUMBER,
  countedStepsFor,
  digitSum
} from "../src/countdown.js";

const DECK = Array.from({ length: 24 }, (_, i) => `card-${i + 1}`);
const TARGET = DECK[FORCED_POSITION - 1]!; // card-9

describe("countdown arithmetic", () => {
  it("every number in range counts to the forced position", () => {
    for (let n = MIN_NUMBER; n <= MAX_NUMBER; n += 1) {
      expect(countedStepsFor(n)).toBe(digitSum(n));
    }
  });
  it("digitSum is plain decimal digit sum", () => {
    expect(digitSum(10)).toBe(1);
    expect(digitSum(19)).toBe(10);
  });
});

describe("CountdownForce", () => {
  it("seals before any input; every permitted number produces the sealed card", () => {
    for (let n = MIN_NUMBER; n <= MAX_NUMBER; n += 1) {
      const force = new CountdownForce(DECK, TARGET, `nonce-${n}`);
      expect(force.sealed.commitment).toMatch(/^[0-9a-f]{64}$/);
      force.nameNumber(n);
      force.deal();
      const { produced, verified } = force.openSeal();
      expect(produced).toBe(TARGET);
      expect(verified).toBe(true);
      const trace = force.trace();
      expect(trace.phase).toBe("revealed");
      expect(trace.namedNumber).toBe(n);
      expect(trace.dealOrder).toHaveLength(n);
      expect(trace.countedSteps).toBe(digitSum(n));
      expect(trace.sealVerified).toBe(true);
    }
  });

  it("rejects out-of-range numbers verbatim, never reinterprets", () => {
    const force = new CountdownForce(DECK, TARGET, "nonce-x");
    expect(() => force.nameNumber(9)).toThrow(/rejected, not reinterpreted/);
    expect(() => force.nameNumber(20)).toThrow(/rejected/);
    expect(() => force.nameNumber(10.5)).toThrow(/rejected/);
    expect(force.trace().namedNumber).toBeNull();
  });

  it("refuses to perform on a broken arrangement", () => {
    const broken = [...DECK];
    broken[FORCED_POSITION - 1] = "not-the-target";
    expect(() => new CountdownForce(broken, TARGET, "nonce-y")).toThrow(/arrangement broken/);
  });

  it("seal verification rejects any card that is not the sealed target (owned-miss basis)", () => {
    const force = new CountdownForce(DECK, TARGET, "nonce-z");
    force.nameNumber(12);
    force.deal();
    // The produced card verifies; a different card against the same seal must not.
    expect(verifySealedPrediction(force.sealed, TARGET, force.sealed.nonce)).toBe(true);
    expect(verifySealedPrediction(force.sealed, "card-1", force.sealed.nonce)).toBe(false);
    expect(verifySealedPrediction(force.sealed, TARGET, "wrong-nonce")).toBe(false);
  });

  it("refuses to open the seal before the deal", () => {
    const force = new CountdownForce(DECK, TARGET, "nonce-q");
    expect(() => force.openSeal()).toThrow(/deal first/);
    expect(force.trace().sealVerified).toBeNull();
  });

  it("requires a deck deep enough for the largest permitted number", () => {
    expect(() => new CountdownForce(DECK.slice(0, MAX_NUMBER - 1), TARGET, "nonce-s")).toThrow(/at least/);
  });
});
