/**
 * Live patter for The Twelve and Ember Words via Puter.js -> Muse Spark Open.
 * Same discipline as the operator proxy path: the payload is a short text
 * template plus tone, the output passes the shared claim filter, and any
 * failure falls back to the scripted line honestly.
 */
import { sanitizeLine, type PatterPayload } from "@loki/showrunner";
import { puterChat, PUTER_MODEL, type PuterChatImpl } from "./puter-chat.js";

export interface PuterPatterOptions {
  timeoutMs?: number;
  chatImpl?: PuterChatImpl;
}

export async function rewritePatterViaPuter(
  payload: PatterPayload,
  options: PuterPatterOptions = {}
): Promise<{ line: string; source: "template" | "llm"; reason?: string }> {
  const fallback = sanitizeLine(payload.template, "This is an illusion. The choice is yours.");
  const result = await puterChat(
    [
      {
        role: "system",
        content:
          "You write one short performer line for LOKI, a consent-based mentalism performance. " +
          "Rules: exactly one sentence under 170 characters; no URLs; no braces; plain text only. " +
          `Stay strictly within these allowed claims: ${payload.allowedClaims.join(", ")}. ` +
          "Never claim mind reading, lie detection, emotion reading, diagnosis, certainty, or a guaranteed result. " +
          "Keep the meaning of the given line; only the wording may change."
      },
      {
        role: "user",
        content: `Beat: ${payload.beat}. Tone: ${payload.tone}. Line to rewrite: "${payload.template}"`
      }
    ],
    // max_tokens 512: reasoning-model headroom (observed ~243 hidden reasoning tokens on a trivial live call before content)
    { model: PUTER_MODEL, max_tokens: 512, temperature: 0.8, timeoutMs: options.timeoutMs, chatImpl: options.chatImpl }
  );
  if ("error" in result) return { line: fallback, source: "template", reason: result.error };
  const safe = sanitizeLine(result.text, fallback);
  if (safe === fallback && result.text.trim() !== fallback) {
    return { line: fallback, source: "template", reason: "rejected" };
  }
  return { line: safe, source: "llm" };
}
