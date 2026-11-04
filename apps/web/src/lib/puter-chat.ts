/**
 * Puter.js route to Meta's Muse Spark Open.
 *
 * Puter.js is a client-side SDK with NO API keys: each spectator signs in with
 * their own Puter account and their own free allowance covers their usage
 * (docs.puter.com/user-pays-model). The public build therefore carries no
 * endpoint and no token, matching the repository rule for hosted voice.
 *
 * The SDK is loaded on demand ONLY when a live-voice feature is enabled, so
 * the default scripted build makes zero third-party requests.
 *
 * Payload discipline is identical to the operator proxy: a short text template
 * plus tone/state. Never audio, video, camera frames, or identity data.
 */

export const PUTER_MODEL = "meta/muse-spark-open";
export const PUTER_SDK_URL = "https://js.puter.com/v2/";

export interface PuterChatOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export type PuterChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type PuterChatImpl = (messages: PuterChatMessage[], options: PuterChatOptions) => Promise<unknown>;

declare global {
  interface Window {
    puter?: { ai?: { chat?: PuterChatImpl } };
  }
}

let sdkPromise: Promise<PuterChatImpl> | null = null;

/** Loads the Puter SDK once and returns its chat function. Rejects if unavailable. */
export function loadPuterChat(scriptInjector?: (src: string) => Promise<void>): Promise<PuterChatImpl> {
  if (window.puter?.ai?.chat) return Promise.resolve(window.puter.ai.chat.bind(window.puter.ai));
  if (!sdkPromise) {
    const inject =
      scriptInjector ??
      ((src: string) =>
        new Promise<void>((resolve, reject) => {
          const el = document.createElement("script");
          el.src = src;
          el.async = true;
          el.onload = () => resolve();
          el.onerror = () => reject(new Error("sdk-load-failed"));
          document.head.appendChild(el);
        }));
    sdkPromise = inject(PUTER_SDK_URL).then(() => {
      const chat = window.puter?.ai?.chat;
      if (!chat) {
        sdkPromise = null;
        throw new Error("sdk-missing-chat");
      }
      return chat.bind(window.puter!.ai);
    });
    sdkPromise.catch(() => {
      sdkPromise = null;
    });
  }
  return sdkPromise;
}

/** Test hook: reset the cached SDK promise. */
export function resetPuterSdkCache(): void {
  sdkPromise = null;
}

/**
 * Pulls the completed text out of the chat() response across the shapes the
 * SDK and its upstream vendors return. Unknown shapes yield null.
 */
export function extractPuterText(response: unknown): string | null {
  if (typeof response === "string") return response;
  if (typeof response !== "object" || response === null) return null;
  const r = response as Record<string, unknown>;
  if (typeof r.text === "string") return r.text;
  const message = r.message as Record<string, unknown> | undefined;
  if (message && typeof message === "object") {
    const content = message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const parts = content
        .map((part) => {
          if (typeof part === "string") return part;
          if (typeof part === "object" && part !== null && typeof (part as { text?: unknown }).text === "string") {
            return (part as { text: string }).text;
          }
          return "";
        })
        .filter(Boolean);
      if (parts.length > 0) return parts.join(" ");
    }
  }
  if (typeof r.toString === "function" && r.toString !== Object.prototype.toString) {
    const s = r.toString();
    if (s && s !== "[object Object]") return s;
  }
  return null;
}

/** One bounded chat call with an explicit timeout. Never streams: patter lines are short. */
export async function puterChat(
  messages: PuterChatMessage[],
  options: PuterChatOptions & { timeoutMs?: number; chatImpl?: PuterChatImpl } = {}
): Promise<{ text: string } | { error: string }> {
  const timeoutMs = options.timeoutMs ?? 15000;
  try {
    const chat = options.chatImpl ?? (await loadPuterChat());
    const response = await Promise.race([
      chat(messages, {
        model: options.model ?? PUTER_MODEL,
        max_tokens: options.max_tokens ?? 120,
        temperature: options.temperature ?? 0.8
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
    ]);
    const text = extractPuterText(response);
    if (!text || !text.trim()) return { error: "empty" };
    return { text: text.trim() };
  } catch (error) {
    return { error: error instanceof Error && error.message === "timeout" ? "timeout" : "puter-error" };
  }
}
