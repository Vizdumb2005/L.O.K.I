import { describe, expect, it } from "vitest";
import { ModelConductor, PuterConductor, ScriptedConductor, scriptedLine } from "./conductor.js";
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
  it("never ships the sealed target before the seal is open", async () => {
    let sent = "";
    const c = new ModelConductor({
      endpoint: "http://localhost:1/",
      fetchImpl: async (_u, init) => { sent = String(init?.body); return new Response(JSON.stringify({ text: "ok" }), { status: 200 }); }
    });
    await c.conduct("deal", TRACE, null);
    const early = JSON.parse(sent) as { trace: { sealedTargetId: unknown; producedCardId: unknown } };
    expect(early.trace.sealedTargetId).toBeNull();
    expect(early.trace.producedCardId).toBeNull();

    await c.conduct("reveal", TRACE, "Queen of Spades");
    const late = JSON.parse(sent) as { trace: { sealedTargetId: unknown } };
    expect(late.trace.sealedTargetId).toBe(TRACE.sealedTargetId);
  });

  it("passes the abort signal through to fetch and stays quiet after abort", async () => {
    let seenSignal: AbortSignal | null = null;
    const c = new ModelConductor({
      endpoint: "http://localhost:1/",
      fetchImpl: async (_u, init) => {
        seenSignal = (init?.signal as AbortSignal) ?? null;
        return new Response(JSON.stringify({ text: "ok" }), { status: 200 });
      }
    });
    const ctl = new AbortController();
    await c.conduct("deal", TRACE, null, ctl.signal);
    expect(seenSignal).toBe(ctl.signal);

    const aborted = new ModelConductor({
      endpoint: "http://localhost:1/",
      fetchImpl: async (_u, init) => {
        const sig = init?.signal as AbortSignal | null;
        if (sig?.aborted) throw new DOMException("aborted", "AbortError");
        return new Response(JSON.stringify({ text: "ok" }), { status: 200 });
      }
    });
    const ctl2 = new AbortController();
    ctl2.abort();
    const line = await aborted.conduct("deal", TRACE, null, ctl2.signal);
    expect(line.voice).toBe("script");
  });
});

describe("ScriptedConductor", () => {
  it("labels every line script", async () => {
    const line = await new ScriptedConductor().conduct("seal", TRACE, null);
    expect(line.voice).toBe("script");
  });
});

describe("PuterConductor", () => {
  it("returns model lines when the chat succeeds", async () => {
    const { PuterConductor } = await import("./conductor.js");
    const c = new PuterConductor({ chatImpl: async () => ({ message: { content: "Thirteen. Heard - watch them fall exactly as you said." } }) });
    const line = await c.conduct("deal", TRACE, null);
    expect(line.voice).toBe("model");
    expect(line.text).toContain("Thirteen");
  });

  it("pins meta/muse-spark-open", async () => {
    const { PuterConductor } = await import("./conductor.js");
    let seen: { model?: string } | undefined;
    const c = new PuterConductor({
      chatImpl: async (_m, o) => {
        seen = o;
        return "A line.";
      }
    });
    await c.conduct("deal", TRACE, null);
    expect(seen?.model).toBe("meta/muse-spark-open");
  });

  it("never sends the sealed target or produced card before the seal opens", async () => {
    const { PuterConductor } = await import("./conductor.js");
    const bodies: string[] = [];
    const c = new PuterConductor({
      chatImpl: async (m) => {
        bodies.push(typeof m[1]?.content === "string" ? m[1].content : JSON.stringify(m));
        return "A line.";
      }
    });
    await c.conduct("seal", TRACE, null);
    await c.conduct("deal", TRACE, null);
    await c.conduct("count", TRACE, null);
    for (const body of bodies) {
      expect(body).not.toContain('"sealedTargetId":"qs"');
      expect(body).not.toContain('"producedCardId":"qs"');
    }
    await c.conduct("reveal", TRACE, "Queen of Spades");
    expect(bodies[bodies.length - 1]).toContain('"sealedTargetId":"qs"');
  });

  it("falls back to script on error, empty, overlong, URL, brace, or banned-claim output", async () => {
    const { PuterConductor } = await import("./conductor.js");
    const cases: unknown[] = [
      new Error("nope"),
      { message: { content: "   " } },
      { message: { content: "x".repeat(400) } },
      { message: { content: "see https://example.com" } },
      { message: { content: "has {brace}" } },
      { message: { content: "I can read your mind with 100% accuracy" } }
    ];
    for (const k of cases) {
      const c = new PuterConductor({
        chatImpl: async () => {
          if (k instanceof Error) throw k;
          return k;
        }
      });
      const line = await c.conduct("deal", TRACE, null);
      expect(line.voice).toBe("script");
      expect(line.text).toBe(scriptedLine("deal", TRACE, null));
    }
  });
});
