import { describe, expect, it } from "vitest";
import { ModelConductor, ScriptedConductor, scriptedLine } from "./conductor.js";
import type { CountdownTrace } from "@loki/effect-countdown";

const TRACE: CountdownTrace = {
  namedNumber: 13,
  dealOrder: ["a", "b"],
  countedSteps: 4,
  producedCardId: "qs",
  sealedTargetId: "qs",
  sealVerified: true,
  phase: "revealed"
};

describe("scripted conduction", () => {
  it("speaks the real trace state", () => {
    expect(scriptedLine("deal", TRACE, null)).toContain("13");
    expect(scriptedLine("count", TRACE, null)).toContain("4");
    expect(scriptedLine("reveal", TRACE, "Queen of Spades")).toContain("Queen of Spades");
    expect(scriptedLine("miss", TRACE, null)).toContain("honest miss");
  });
  it("never claims mind-reading in any beat", () => {
    for (const beat of ["seal", "invite-number", "deal", "count", "reveal", "miss"] as const) {
      expect(scriptedLine(beat, TRACE, null)).not.toMatch(/read your mind|i sensed|i felt your/i);
    }
  });
});

describe("ModelConductor", () => {
  it("falls back to script when no endpoint is configured", async () => {
    const c = new ModelConductor({ endpoint: null });
    const line = await c.conduct("deal", TRACE, null);
    expect(line.voice).toBe("script");
    expect(line.text).toContain("13");
  });
  it("marks model lines as model", async () => {
    const c = new ModelConductor({
      endpoint: "http://localhost:1/conduct",
      fetchImpl: async () => new Response(JSON.stringify({ text: "Thirteen. A bold number." }), { status: 200 })
    });
    const line = await c.conduct("deal", TRACE, null);
    expect(line.voice).toBe("model");
    expect(line.text).toBe("Thirteen. A bold number.");
  });
  it("falls back on http error, network error, and empty text", async () => {
    const err = new ModelConductor({ endpoint: "http://x/", fetchImpl: async () => new Response("nope", { status: 500 }) });
    expect((await err.conduct("deal", TRACE, null)).voice).toBe("script");
    const net = new ModelConductor({ endpoint: "http://x/", fetchImpl: async () => { throw new Error("down"); } });
    expect((await net.conduct("deal", TRACE, null)).voice).toBe("script");
    const empty = new ModelConductor({ endpoint: "http://x/", fetchImpl: async () => new Response(JSON.stringify({ text: "  " }), { status: 200 }) });
    expect((await empty.conduct("deal", TRACE, null)).voice).toBe("script");
  });
  it("sends only public trace state, never the deal order", async () => {
    let sent = "";
    const c = new ModelConductor({
      endpoint: "http://localhost:1/",
      fetchImpl: async (_u, init) => { sent = String(init?.body); return new Response(JSON.stringify({ text: "ok" }), { status: 200 }); }
    });
    await c.conduct("reveal", TRACE, "Queen of Spades");
    expect(sent).toContain("namedNumber");
    expect(sent).not.toContain("dealOrder");
  });
});

describe("ScriptedConductor", () => {
  it("labels every line script", async () => {
    const line = await new ScriptedConductor().conduct("seal", TRACE, null);
    expect(line.voice).toBe("script");
  });
});
