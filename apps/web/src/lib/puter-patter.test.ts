import { describe, expect, it } from "vitest";
import { rewritePatterViaPuter } from "./puter-patter.js";
import { PUTER_MODEL, type PuterChatMessage, type PuterChatOptions } from "./puter-chat.js";

const PAYLOAD = {
  beat: "build",
  tone: "intimate" as const,
  allowedClaims: ["mentalism", "illusion", "performance", "consent"],
  template: "Watch the cards. Your answers steer them."
};

describe("rewritePatterViaPuter", () => {
  it("returns sanitized model lines with source llm", async () => {
    const chat = async () => ({ message: { content: "  Watch them fall.   Your choices steer.  " } });
    const r = await rewritePatterViaPuter(PAYLOAD, { chatImpl: chat });
    expect(r.source).toBe("llm");
    expect(r.line).toBe("Watch them fall. Your choices steer.");
  });

  it("pins meta/muse-spark-open", async () => {
    let seen: PuterChatOptions | undefined;
    const chat = async (_m: PuterChatMessage[], o: PuterChatOptions) => {
      seen = o;
      return "ok line";
    };
    await rewritePatterViaPuter(PAYLOAD, { chatImpl: chat });
    expect(seen?.model).toBe(PUTER_MODEL);
  });

  it("falls back on banned claims in the output", async () => {
    const chat = async () => "I can read your mind completely.";
    const r = await rewritePatterViaPuter(PAYLOAD, { chatImpl: chat });
    expect(r.source).toBe("template");
    expect(r.line).toBe(PAYLOAD.template);
    expect(r.reason).toBe("rejected");
  });

  it("falls back on errors with the template line", async () => {
    const chat = async () => {
      throw new Error("sign-in cancelled");
    };
    const r = await rewritePatterViaPuter(PAYLOAD, { chatImpl: chat });
    expect(r).toEqual({ line: PAYLOAD.template, source: "template", reason: "puter-error" });
  });

  it("falls back on timeout", async () => {
    const chat = () => new Promise(() => {});
    const r = await rewritePatterViaPuter(PAYLOAD, { chatImpl: chat, timeoutMs: 20 });
    expect(r.source).toBe("template");
    expect(r.reason).toBe("timeout");
  });
});
