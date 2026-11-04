import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";

let base: string;
let server: import("node:http").Server;

beforeAll(async () => {
  process.env.ORACLE_TOKEN = "test-secret";
  process.env.ORACLE_ALLOWED_ORIGIN = "https://loki.example";
  const mod = await import("../scripts/llm-proxy.js");
  server = mod.server;
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolveClose) => server.close(resolveClose));
  delete process.env.ORACLE_TOKEN;
  delete process.env.ORACLE_ALLOWED_ORIGIN;
});

describe("hosted proxy access control", () => {
  it("rejects requests without the shared token", async () => {
    const res = await fetch(`${base}/api/conduct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ beat: "deal" })
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong token", async () => {
    const res = await fetch(`${base}/api/conduct`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-oracle-token": "wrong" },
      body: JSON.stringify({ beat: "deal" })
    });
    expect(res.status).toBe(401);
  });

  it("accepts the shared token and falls back honestly with no model key", async () => {
    const res = await fetch(`${base}/api/conduct`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-oracle-token": "test-secret" },
      body: JSON.stringify({ beat: "deal", trace: { namedNumber: 12 } })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { voice: string; reason: string };
    expect(body.voice).toBe("script");
    expect(body.reason).toBe("no-key");
  });

  it("echoes CORS only for the allow-listed origin", async () => {
    const good = await fetch(`${base}/health`, { headers: { origin: "https://loki.example", "x-oracle-token": "test-secret" } });
    expect(good.headers.get("access-control-allow-origin")).toBe("https://loki.example");
    const bad = await fetch(`${base}/health`, { headers: { origin: "https://evil.example", "x-oracle-token": "test-secret" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflight only for the allowed origin", async () => {
    const res = await fetch(`${base}/api/conduct`, {
      method: "OPTIONS",
      headers: { origin: "https://loki.example" }
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://loki.example");
    const bad = await fetch(`${base}/api/conduct`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects an unknown beat with the token present", async () => {
    const res = await fetch(`${base}/api/conduct`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-oracle-token": "test-secret" },
      body: JSON.stringify({ beat: "divine-the-future" })
    });
    expect(res.status).toBe(400);
  });
});
