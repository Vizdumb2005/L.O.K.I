import { describe, expect, it } from "vitest";
import { sealPrediction, sha256Hex, verifySealedPrediction } from "../src/index.js";

describe("sha256Hex", () => {
  it("matches known vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("a:nonce")).toBe(sha256Hex("a:nonce"));
    expect(sha256Hex("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sealed prediction", () => {
  it("seals and verifies round-trip", () => {
    const sealed = sealPrediction("comet", "abc123", 42);
    expect(sealed.commitment).toBe(sha256Hex("comet:abc123"));
    expect(sealed.committedAt).toBe(42);
    expect(verifySealedPrediction(sealed, "comet", "abc123")).toBe(true);
  });

  it("rejects wrong id, wrong nonce, truncated and empty inputs without throwing", () => {
    const sealed = sealPrediction("comet", "abc123", 0);
    expect(verifySealedPrediction(sealed, "moon", "abc123")).toBe(false);
    expect(verifySealedPrediction(sealed, "comet", "other")).toBe(false);
    expect(verifySealedPrediction({ ...sealed, commitment: sealed.commitment.slice(0, 10) }, "comet", "abc123")).toBe(false);
    expect(verifySealedPrediction(sealed, "", "")).toBe(false);
    expect(verifySealedPrediction({ ...sealed, commitment: "zzzz" }, "comet", "abc123")).toBe(false);
  });

  it("throws on empty id or nonce at seal time", () => {
    expect(() => sealPrediction("", "n", 0)).toThrow();
    expect(() => sealPrediction("a", "", 0)).toThrow();
  });
});
