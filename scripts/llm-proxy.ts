import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findBannedClaim } from "../packages/effect-api/src/claims.js";

function loadDotEnv(path: string): void {
  try {
    const text = readFileSync(path, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1]!;
      if (process.env[key]) continue;
      process.env[key] = match[2]!.replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional.
  }
}

loadDotEnv(resolve(process.cwd(), ".env"));

const PORT = Number(process.env.LLM_PROXY_PORT ?? 8787);
const BASE_URL = process.env.BASETEN_BASE_URL ?? "https://inference.baseten.co/v1";
const MODEL = process.env.BASETEN_MODEL ?? "meta-models/muse-spark-open";
const API_KEY = process.env.BASETEN_API_KEY;
const MAX_BODY = 8 * 1024;
const RATE_WINDOW = 60_000;
const RATE_LIMIT = 20;
const hits = new Map<string, number[]>();

interface PatterRequest {
  beat?: unknown;
  tone?: unknown;
  allowedClaims?: unknown;
  template?: unknown;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > MAX_BODY) {
        reject(new Error("body-too-large"));
        req.destroy();
      }
    });
    req.on("end", () => resolveBody(body));
    req.on("error", reject);
  });
}

function safeLine(line: string): string | null {
  const trimmed = line.replace(/\s+/g, " ").trim().replace(/^["'`]|["'`]$/g, "");
  if (!trimmed || trimmed.length > 160) return null;
  if (/[\r\n]/.test(line) || /https?:\/\//i.test(trimmed) || /[{}]/.test(trimmed)) return null;
  if (findBannedClaim(trimmed)) return null;
  return trimmed;
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < RATE_WINDOW);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

async function rewrite(template: string, beat: string, tone: string): Promise<{
  line: string;
  source: "template" | "llm";
  reason?: string;
}> {
  const fallback = safeLine(template) ?? "The room is quiet. The choice is yours.";
  if (!API_KEY) return { line: fallback, source: "template", reason: "no-key" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 90,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You rewrite one line of stage patter for a consent-based mentalism illusion. " +
              "Never claim mind reading, telepathy, lie detection, emotion reading, diagnosis, " +
              "guarantees, world firsts, brain scans, supernatural powers, or scientific proof. " +
              "Keep the spectator free to lie or stop. Return one plain line under 140 characters, " +
              "no quotes, no markdown, no newline."
          },
          {
            role: "user",
            content: JSON.stringify({
              beat,
              tone,
              template,
              constraints: ["one line", "under 140 characters", "no claims beyond an illusion"]
            })
          }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      return { line: fallback, source: "template", reason: `http-${response.status}` };
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return { line: fallback, source: "template", reason: "bad-json" };
    const safe = safeLine(raw);
    if (!safe) return { line: fallback, source: "template", reason: "rejected" };
    return { line: safe, source: "llm" };
  } catch (error) {
    return {
      line: fallback,
      source: "template",
      reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network"
    };
  } finally {
    clearTimeout(timer);
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true, keyConfigured: Boolean(API_KEY), model: MODEL, baseUrl: BASE_URL });
    return;
  }
  if (req.method !== "POST" || req.url !== "/api/patter") {
    json(res, 404, { error: "not-found" });
    return;
  }

  const ip = req.socket.remoteAddress ?? "local";
  if (rateLimited(ip)) {
    json(res, 200, { line: "", source: "template", reason: "rate-limit" });
    return;
  }

  try {
    const body = JSON.parse(await readBody(req)) as PatterRequest;
    if (typeof body.template !== "string" || body.template.length > 500) {
      json(res, 400, { error: "bad-template" });
      return;
    }
    const beat = typeof body.beat === "string" ? body.beat.slice(0, 40) : "build";
    const tone = typeof body.tone === "string" ? body.tone.slice(0, 30) : "intimate";
    const result = await rewrite(body.template, beat, tone);
    json(res, 200, result);
  } catch {
    json(res, 400, { error: "bad-request" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`LLM patter proxy: http://127.0.0.1:${PORT}/api/patter`);
  console.log(`Model: ${MODEL} · key ${API_KEY ? "configured" : "absent (offline fallback)"}`);
});
