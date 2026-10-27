import { findBannedClaim } from "@loki/effect-api";

export const MAX_PATTER_LENGTH = 180;

export function sanitizeLine(line: string, fallback: string, maxLength = MAX_PATTER_LENGTH): string {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return fallback;
  if (trimmed.length > maxLength) return fallback;
  if (/[\r\n]/.test(line)) return fallback;
  if (/https?:\/\//i.test(trimmed)) return fallback;
  if (/[{}]/.test(trimmed)) return fallback;
  if (findBannedClaim(trimmed)) return fallback;
  return trimmed;
}

export interface PatterPayload {
  beat: string;
  tone: "intimate" | "wry" | "awe" | "reassuring";
  allowedClaims: string[];
  template: string;
}

export interface PatterRewriteOptions {
  endpoint: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Optional LLM rewrite. The payload is text only. The function always returns a safe
 * line, falling back to the template on any failure, timeout, or banned output.
 */
export async function rewritePatter(
  payload: PatterPayload,
  options: PatterRewriteOptions
): Promise<{ line: string; source: "template" | "llm"; reason?: string }> {
  const fallback = sanitizeLine(payload.template, "This is an illusion. The choice is yours.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1200);
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch(options.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) return { line: fallback, source: "template", reason: `http-${res.status}` };
    const data = (await res.json()) as { line?: unknown };
    if (typeof data.line !== "string") {
      return { line: fallback, source: "template", reason: "bad-json" };
    }
    const safe = sanitizeLine(data.line, fallback);
    if (safe === fallback && data.line.trim() !== fallback) {
      return { line: fallback, source: "template", reason: "rejected" };
    }
    return { line: safe, source: "llm" };
  } catch (error) {
    return {
      line: fallback,
      source: "template",
      reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network"
    };
  } finally {
    clearTimeout(timeout);
  }
}
