import { describe, expect, it } from "vitest";
import { decideAnswer, gateDecision, mapAnswerToken, TAU_ACCEPT, TAU_REJECT } from "./voice-answer.js";

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
