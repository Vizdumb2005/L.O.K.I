import { describe, expect, it } from "vitest";
import { safeConduction } from "../scripts/llm-proxy.js";

describe("safeConduction adversarial filtering", () => {
  it("accepts a normal theatrical line", () => {
    expect(safeConduction("Seventeen. Heard. Watch the cards fall.")).toBe("Seventeen. Heard. Watch the cards fall.");
  });
  it("rejects newlines, urls, braces, and over-length output", () => {
    expect(safeConduction("line one\nline two")).toBeNull();
    expect(safeConduction("see https://evil.example for the secret")).toBeNull();
    expect(safeConduction("{ \"json\": true }")).toBeNull();
    expect(safeConduction("x".repeat(281))).toBeNull();
  });
  it("rejects empty and whitespace-only", () => {
    expect(safeConduction("")).toBeNull();
    expect(safeConduction("   ")).toBeNull();
  });
  it("strips wrapping quotes", () => {
    expect(safeConduction('"A quiet room."')).toBe("A quiet room.");
  });
});
