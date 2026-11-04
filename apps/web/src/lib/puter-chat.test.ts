import { describe, expect, it } from "vitest";
import { extractPuterText, puterChat, PUTER_MODEL } from "./puter-chat.js";
import type { PuterChatMessage, PuterChatOptions } from "./puter-chat.js";

describe("extractPuterText", () => {
  it("reads plain strings", () => {
    expect(extractPuterText("hello")).toBe("hello");
  });
  it("reads message.content strings", () => {
    expect(extractPuterText({ message: { content: "hi" } })).toBe("hi");
  });
  it("reads message.content part arrays", () => {
    expect(extractPuterText({ message: { content: [{ text: "a" }, { text: "b" }] } })).toBe("a b");
  });
  it("reads top-level text", () => {
    expect(extractPuterText({ text: "t" })).toBe("t");
  });
  it("rejects unknown shapes", () => {
    expect(extractPuterText({ nope: 1 })).toBeNull();
    expect(extractPuterText(42)).toBeNull();
    expect(extractPuterText(null)).toBeNull();
  });
});

describe("puterChat", () => {
  const msgs: PuterChatMessage[] = [{ role: "user", content: "hi" }];

  it("pins the Muse Spark Open model and bounds tokens", async () => {
    let seen: PuterChatOptions | undefined;
    const chat = async (_m: PuterChatMessage[], o: PuterChatOptions) => {
      seen = o;
      return "ok";
    };
    const r = await puterChat(msgs, { chatImpl: chat });
    expect(r).toEqual({ text: "ok" });
    expect(seen?.model).toBe(PUTER_MODEL);
    expect(seen?.max_tokens).toBeGreaterThan(0);
  });

  it("times out instead of hanging", async () => {
    const chat = () => new Promise(() => {});
    const r = await puterChat(msgs, { chatImpl: chat, timeoutMs: 20 });
    expect(r).toEqual({ error: "timeout" });
  });

  it("maps rejections to a bounded error", async () => {
    const chat = async () => {
      throw new Error("upstream_rate_limited");
    };
    expect(await puterChat(msgs, { chatImpl: chat })).toEqual({ error: "puter-error" });
  });

  it("maps empty responses to an error", async () => {
    const chat = async () => ({ message: { content: "  " } });
    expect(await puterChat(msgs, { chatImpl: chat })).toEqual({ error: "empty" });
  });
});
