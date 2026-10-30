import { describe, expect, it, vi } from "vitest";
import { decideAnswer, decideOptionAnswer, gateDecision, mapAnswerToken, matchSpokenOption, qualifyWebGPU, TAU_ACCEPT, TAU_REJECT } from "./voice-answer.js";

const speech = new Float32Array(16000).fill(0.05);

describe("mapAnswerToken", () => {
  it("maps clear confirmations", () => {
    expect(mapAnswerToken("True.")).toBe("confirm");
    expect(mapAnswerToken("That's true of my card")).toBe("confirm");
    expect(mapAnswerToken("Yes, that fits")).toBe("confirm");
    expect(mapAnswerToken("Correct")).toBe("confirm");
  });
  it("maps clear denials", () => {
    expect(mapAnswerToken("Wrong.")).toBe("deny");
    expect(mapAnswerToken("That's wrong")).toBe("deny");
    expect(mapAnswerToken("No, not mine")).toBe("deny");
    expect(mapAnswerToken("Not true")).toBe("deny");
    expect(mapAnswerToken("It doesn't fit")).toBe("deny");
  });
  it("returns null on unclear or conflicting transcripts", () => {
    expect(mapAnswerToken("")).toBeNull();
    expect(mapAnswerToken("I think it might be the three of diamonds")).toBeNull();
    expect(mapAnswerToken("Are we doing the card trick now?")).toBeNull();
  });
});

describe("gateDecision", () => {
  it("applies the a priori thresholds with an abstain zone", () => {
    expect(gateDecision(TAU_ACCEPT)).toBe("accept");
    expect(gateDecision(TAU_REJECT)).toBe("reject");
    expect(gateDecision((TAU_ACCEPT + TAU_REJECT) / 2)).toBe("abstain");
  });
});

describe("decideAnswer", () => {
  it("never produces an answer when the gate does not accept", () => {
    for (const sim of [TAU_REJECT - 0.01, (TAU_ACCEPT + TAU_REJECT) / 2, null]) {
      const d = decideAnswer(speech, 1.5, sim, "true");
      expect(d.kind).toBe("uncertain");
      expect(d.token).toBeNull();
    }
  });
  it("answers only on accepted gate plus a clear token", () => {
    const d = decideAnswer(speech, 1.5, TAU_ACCEPT + 0.1, "That's wrong");
    expect(d).toMatchObject({ kind: "answer", token: "deny", gate: "accept" });
  });
  it("treats accepted-but-unclear speech as uncertain, never guessed", () => {
    const d = decideAnswer(speech, 1.5, TAU_ACCEPT + 0.1, "the three of diamonds maybe");
    expect(d.kind).toBe("uncertain");
  });
  it("rejects silence and too-short audio as uncertain", () => {
    expect(decideAnswer(new Float32Array(16000), 1.0, 0.9, "").reason).toBe("silence");
    expect(decideAnswer(speech, 0.1, 0.9, "true").reason).toBe("too short to be an answer");
  });
});

describe("rejection wording", () => {
  it("never claims identity from a gate rejection or abstention", () => {
    for (const sim of [0.1, (TAU_ACCEPT + TAU_REJECT) / 2]) {
      const d = decideAnswer(speech, 1.5, sim, "true");
      expect(d.reason).not.toMatch(/is not the enrolled/);
      expect(d.reason).toMatch(/no answer accepted/);
    }
  });
});

describe("matchSpokenOption", () => {
  it("matches a spoken label as a whole word", () => {
    expect(matchSpokenOption("ace", ["Ace", "Two", "Three", "Four"])).toBe(0);
    expect(matchSpokenOption("I think three", ["Ace", "Two", "Three", "Four"])).toBe(2);
  });
  it("abstains on zero or multiple matches", () => {
    expect(matchSpokenOption("maybe seven", ["Ace", "Two", "Three", "Four"])).toBeNull();
    expect(matchSpokenOption("ace or four", ["Ace", "Two", "Three", "Four"])).toBeNull();
  });
  it("does not match substrings of other words", () => {
    expect(matchSpokenOption("a tower", ["Ace", "Two", "Three", "Four"])).toBeNull();
  });
  it("maps confirm and deny cues onto yes/no options", () => {
    expect(matchSpokenOption("that's true", ["Yes", "No"])).toBe(0);
    expect(matchSpokenOption("wrong", ["Yes", "No"])).toBe(1);
    expect(matchSpokenOption("not true", ["Yes", "No"])).toBe(1);
    expect(matchSpokenOption("um", ["Yes", "No"])).toBeNull();
  });
});

describe("decideOptionAnswer", () => {
  const loud = new Float32Array(16000).fill(0.2);
  it("answers when the gate accepts and one option matches", () => {
    const d = decideOptionAnswer(loud, 1, 0.9, "three", ["Ace", "Two", "Three", "Four"]);
    expect(d.kind).toBe("answer");
    expect(d.index).toBe(2);
  });
  it("rejects a non-enrolled voice without claiming identity", () => {
    const d = decideOptionAnswer(loud, 1, 0.2, "three", ["Ace", "Two", "Three", "Four"]);
    expect(d.kind).toBe("uncertain");
    expect(d.reason).toContain("could not confidently match the enrolled voice");
    expect(d.reason).not.toMatch(/impostor|not you|stranger/i);
  });
  it("abstains when the transcript is ambiguous", () => {
    const d = decideOptionAnswer(loud, 1, 0.9, "ace or four", ["Ace", "Two", "Three", "Four"]);
    expect(d.kind).toBe("uncertain");
  });
  it("abstains on silence", () => {
    const d = decideOptionAnswer(new Float32Array(16000), 1, 0.9, "", ["Yes", "No"]);
    expect(d.kind).toBe("uncertain");
    expect(d.reason).toBe("silence");
  });
});

describe("qualifyWebGPU", () => {
  it("refuses when there is no WebGPU at all", async () => {
    vi.stubGlobal("navigator", {});
    await expect(qualifyWebGPU()).resolves.toBe(false);
    vi.unstubAllGlobals();
  });

  it("refuses a software (fallback) adapter", async () => {
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter: async () => ({ info: { isFallbackAdapter: true } }) }
    });
    await expect(qualifyWebGPU()).resolves.toBe(false);
    vi.unstubAllGlobals();
  });

  it("refuses when the adapter cannot prove hardware (no info)", async () => {
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({}) } });
    await expect(qualifyWebGPU()).resolves.toBe(false);
    vi.unstubAllGlobals();
  });

  it("accepts a hardware adapter", async () => {
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter: async () => ({ info: { isFallbackAdapter: false } }) }
    });
    await expect(qualifyWebGPU()).resolves.toBe(true);
    vi.unstubAllGlobals();
  });

  it("refuses when adapter request throws", async () => {
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter: async () => { throw new Error("denied"); } }
    });
    await expect(qualifyWebGPU()).resolves.toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("qualifyWebGPU memory gate", () => {
  it("refuses on small-memory devices without probing the adapter", async () => {
    let probed = false;
    vi.stubGlobal("navigator", {
      deviceMemory: 2,
      gpu: { requestAdapter: async () => { probed = true; return { info: { isFallbackAdapter: false } }; } }
    });
    await expect(qualifyWebGPU()).resolves.toBe(false);
    expect(probed).toBe(false);
    vi.unstubAllGlobals();
  });

  it("still qualifies the adapter on larger devices", async () => {
    vi.stubGlobal("navigator", {
      deviceMemory: 8,
      gpu: { requestAdapter: async () => ({ info: { isFallbackAdapter: false } }) }
    });
    await expect(qualifyWebGPU()).resolves.toBe(true);
    vi.unstubAllGlobals();
  });
});
