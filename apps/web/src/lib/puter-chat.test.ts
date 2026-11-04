import { describe, expect, it } from "vitest";
import { extractPuterText, loadPuterChat, puterChat, resetPuterSdkCache, PUTER_MODEL, PUTER_SDK_URL } from "./puter-chat.js";
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

describe("loadPuterChat", () => {
  function stubDom() {
    const appended: string[] = [];
    const g = globalThis as Record<string, unknown>;
    g.window = g;
    delete g.puter;
    g.document = {
      querySelector: () => (appended.includes(PUTER_SDK_URL) ? { src: PUTER_SDK_URL } : null),
      createElement: () => ({}),
      head: {
        appendChild: (el: { src?: string; onload?: () => void }) => {
          appended.push(el.src ?? "");
          setTimeout(() => el.onload?.(), 0);
        }
      }
    };
    return appended;
  }
  function teardownDom() {
    const g = globalThis as Record<string, unknown>;
    resetPuterSdkCache();
    delete g.window;
    delete g.document;
    delete g.puter;
  }

  it("injects the SDK once for concurrent callers and reuses it after", async () => {
    const appended = stubDom();
    setTimeout(() => {
      (globalThis as Record<string, unknown>).puter = { ai: { chat: async () => ({ message: { content: "ok" } }) } };
    }, 30);
    const [a, b] = await Promise.all([loadPuterChat(), loadPuterChat()]);
    expect(typeof a).toBe("function");
    expect(typeof b).toBe("function");
    expect(appended).toEqual([PUTER_SDK_URL]);
    const c = await loadPuterChat();
    expect(typeof c).toBe("function");
    expect(appended).toEqual([PUTER_SDK_URL]);
    teardownDom();
  });

  it("never injects a second tag when one already exists", async () => {
    const appended = stubDom();
    appended.push(PUTER_SDK_URL); // an earlier load left its tag behind
    let injections = 0;
    setTimeout(() => {
      (globalThis as Record<string, unknown>).puter = { ai: { chat: async () => ({ message: { content: "ok" } }) } };
    }, 30);
    const chat = await loadPuterChat(async () => {
      injections++;
    });
    expect(typeof chat).toBe("function");
    expect(injections).toBe(0);
    expect(appended).toEqual([PUTER_SDK_URL]);
    teardownDom();
  });
});
