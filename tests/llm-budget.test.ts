import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  inputTokenCeiling,
  loadBudgetConfig,
  reconcileBudget,
  reserveBudget
} from "../scripts/llm-budget.js";

function cfgFor(dir: string, name: string, ceiling = "0.01") {
  return loadBudgetConfig({
    ...process.env,
    LLM_BUDGET_USD: ceiling,
    LLM_BUDGET_LEDGER: join(dir, name),
    LLM_PRICE_IN_PER_M: "1.25",
    LLM_PRICE_OUT_PER_M: "4.25"
  } as NodeJS.ProcessEnv);
}

describe("llm budget guard", () => {
  it("reserves the provable worst case and reconciles actuals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    const cfg = cfgFor(dir, "l.json");
    // 300 ASCII bytes => 300-token hard ceiling (byte-level BPE); max_tokens is a hard cap.
    const r = await reserveBudget(cfg, { inputTokens: inputTokenCeiling("x".repeat(300)), maxOutputTokens: 90 });
    expect(r.ok).toBe(true);
    expect(r.reservedUsd).toBeCloseTo(0.0007575, 10);
    // completion_tokens already includes reasoning (subset breakdown): bill 30, not 40.
    await reconcileBudget(cfg, r.id, { promptTokens: 120, completionTokens: 30 }, "ok");
    const s = await budgetStatus(cfg);
    expect(s.closedActualUsd).toBeCloseTo(0.0002775, 10);
    expect(s.openCalls).toBe(0);
  });

  it("fails closed: an unreconciled call keeps its full reservation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    const cfg = cfgFor(dir, "l.json");
    const r = await reserveBudget(cfg, { inputTokens: 1000, maxOutputTokens: 500 });
    await reconcileBudget(cfg, r.id, null, "http-500");
    const s = await budgetStatus(cfg);
    expect(s.closedActualUsd).toBeCloseTo(0.003375, 10);
  });

  it("refuses at the ceiling without adding an entry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    const cfg = cfgFor(dir, "l.json");
    const before = (await budgetStatus(cfg)).entries;
    const r = await reserveBudget(cfg, { inputTokens: 10_000_000, maxOutputTokens: 10_000 });
    expect(r.ok).toBe(false);
    expect((await budgetStatus(cfg)).entries).toBe(before);
  });

  it("pins the ceiling in the ledger: env can only lower it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    await reserveBudget(cfgFor(dir, "l.json", "0.01"), { inputTokens: 10, maxOutputTokens: 10 });
    const raised = await budgetStatus(cfgFor(dir, "l.json", "999"));
    expect(raised.ceilingUsd).toBeLessThanOrEqual(0.01 + 1e-12);
    const lowered = await budgetStatus(cfgFor(dir, "l.json", "0.005"));
    expect(lowered.ceilingUsd).toBeCloseTo(0.005, 10);
  });

  it("rejects maxOutputTokens beyond the server-enforced cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    await expect(
      reserveBudget(cfgFor(dir, "l.json"), { inputTokens: 10, maxOutputTokens: 300_000 })
    ).rejects.toThrow(/server-enforced cap/);
  });

  it("counts double-reconcile as a no-op", async () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    const cfg = cfgFor(dir, "l.json");
    const r = await reserveBudget(cfg, { inputTokens: 10, maxOutputTokens: 10 });
    await reconcileBudget(cfg, r.id, { promptTokens: 1, completionTokens: 1 }, "ok");
    const s1 = await budgetStatus(cfg);
    await reconcileBudget(cfg, r.id, { promptTokens: 9e9, completionTokens: 9e9 }, "dupe");
    const s2 = await budgetStatus(cfg);
    expect(s2.closedActualUsd).toBeCloseTo(s1.closedActualUsd, 12);
  });
});
