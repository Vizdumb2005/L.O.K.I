/**
 * Hard budget guard for paid LLM calls (Baseten Muse Spark Open via the
 * approved $3.00 awarded-credit test budget).
 *
 * Enforcement model (fail closed):
 *   - BEFORE any upstream call, reserve the worst-case cost:
 *       input bytes (provable ceiling: byte-level BPE => tokens <= bytes)
 *       at input price + max_tokens at output price. Per Baseten's docs,
 *       max_tokens caps the WHOLE completion (reasoning included) and the
 *       API rejects max_tokens > 262144 - no safety factor needed or honest.
 *     Reconciliation bills the reported completion_tokens, which include
 *     reasoning tokens per the OpenAI-compatible usage contract.
 *   - A call starts only if effectiveSpend + reservation <= ceiling, where
 *     effectiveSpend = sum(closed actuals) + sum(open reservations).
 *   - The ledger persists to disk, so restarts do not reset the budget.
 *   - Reconciliation without usage (HTTP error, timeout, network, missing
 *     usage fields) keeps the FULL reservation as actual cost: an error
 *     never proves the upstream did not run or bill.
 *   - No retry escapes a reservation: one reservation id per upstream
 *     attempt; a retried call is a new, separately authorized reservation.
 *   - A cross-process mkdir lock serializes ledger access.
 *
 * Prices default to the published Muse Spark Open rates and can be
 * overridden by env for tests.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface BudgetConfig {
  /** Hard cap in USD; approved test budget default. */
  ceilingUsd: number;
  ledgerPath: string;
  priceInputPerMillion: number;
  priceOutputPerMillion: number;
  /** Worst-case multiplier on max_tokens to cover billed reasoning tokens. */
  maxOutputTokensServerCap: number;
}

export function loadBudgetConfig(env: NodeJS.ProcessEnv = process.env): BudgetConfig {
  return {
    ceilingUsd: Number(env.LLM_BUDGET_USD ?? "3"),
    // Default ledger lives OUTSIDE the repo so it survives clean checkouts and
    // can never be committed or deployed to Pages.
    ledgerPath: resolve(env.LLM_BUDGET_LEDGER ?? `${process.env.HOME}/.loki-llm-budget-ledger.json`),
    priceInputPerMillion: Number(env.LLM_PRICE_IN_PER_M ?? "1.25"),
    priceOutputPerMillion: Number(env.LLM_PRICE_OUT_PER_M ?? "4.25"),
    maxOutputTokensServerCap: 262_144
  };
}

interface LedgerEntry {
  id: string;
  ts: string;
  reservedUsd: number;
  status: "open" | "closed";
  actualUsd?: number;
  note?: string;
}

interface Ledger {
  ceilingUsd?: number;
  version: 1;
  entries: LedgerEntry[];
}

export interface Usage {
  promptTokens?: number;
  /** Includes reasoning tokens (OpenAI-compatible subset semantics). */
  completionTokens?: number;
}

export interface ReserveResult {
  ok: boolean;
  id: string;
  reservedUsd: number;
  effectiveSpendUsd: number;
  ceilingUsd: number;
}

const LOCK_STALE_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withLock<T>(ledgerPath: string, fn: () => T): Promise<T> {
  const lockDir = `${ledgerPath}.lock`;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      mkdirSync(lockDir);
      try {
        return fn();
      } finally {
        rmdirSync(lockDir);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > LOCK_STALE_MS) {
          rmdirSync(lockDir);
          continue;
        }
      } catch {
        // Lock vanished between check and remove; retry.
      }
      await sleep(25);
    }
  }
  throw new Error("budget-lock-timeout");
}

function loadLedger(path: string): Ledger {
  if (!existsSync(path)) return { version: 1, entries: [] };
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Ledger;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error("budget-ledger-corrupt");
  }
  return parsed;
}

function saveLedger(path: string, ledger: Ledger): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function effectiveSpendUsd(ledger: Ledger): number {
  return ledger.entries.reduce(
    (sum, e) => sum + (e.status === "closed" ? (e.actualUsd ?? e.reservedUsd) : e.reservedUsd),
    0
  );
}

/**
 * Provable input-token ceiling: byte-level BPE tokenizers emit at least one
 * byte per token, so token count never exceeds the UTF-8 byte length.
 * This is a hard upper bound, not an estimate.
 */
export function inputTokenCeiling(serializedMessages: string): number {
  return Buffer.byteLength(serializedMessages, "utf8");
}

export async function reserveBudget(
  cfg: BudgetConfig,
  args: { inputTokens: number; maxOutputTokens: number; note?: string }
): Promise<ReserveResult> {
  if (!Number.isInteger(args.maxOutputTokens) || args.maxOutputTokens < 1 || args.maxOutputTokens > cfg.maxOutputTokensServerCap) {
    throw new Error(`maxOutputTokens must be an integer in [1, ${cfg.maxOutputTokensServerCap}] (server-enforced cap)`);
  }
  const id = randomUUID();
  const reservedUsd =
    (args.inputTokens / 1_000_000) * cfg.priceInputPerMillion +
    (args.maxOutputTokens / 1_000_000) * cfg.priceOutputPerMillion;
  return withLock(cfg.ledgerPath, () => {
    const ledger = loadLedger(cfg.ledgerPath);
    // The ceiling is pinned at first use: env may only ever LOWER it, never raise it.
    if (typeof ledger.ceilingUsd !== "number") {
      ledger.ceilingUsd = cfg.ceilingUsd;
      saveLedger(cfg.ledgerPath, ledger);
    }
    const ceiling = Math.min(cfg.ceilingUsd, ledger.ceilingUsd);
    const effective = effectiveSpendUsd(ledger);
    if (effective + reservedUsd > ceiling + 1e-12) {
      return { ok: false, id, reservedUsd, effectiveSpendUsd: effective, ceilingUsd: ceiling };
    }
    ledger.entries.push({
      id,
      ts: new Date().toISOString(),
      reservedUsd,
      status: "open",
      note: args.note
    });
    saveLedger(cfg.ledgerPath, ledger);
    return { ok: true, id, reservedUsd, effectiveSpendUsd: effective + reservedUsd, ceilingUsd: cfg.ceilingUsd };
  });
}

/**
 * Close a reservation. Fail closed: missing/partial usage bills the full
 * reservation. Actual cost is never written below the observed usage.
 */
export async function reconcileBudget(
  cfg: BudgetConfig,
  id: string,
  usage: Usage | null,
  note?: string
): Promise<void> {
  await withLock(cfg.ledgerPath, () => {
    const ledger = loadLedger(cfg.ledgerPath);
    const entry = ledger.entries.find((e) => e.id === id);
    if (!entry || entry.status === "closed") return;
    let actual = entry.reservedUsd;
    if (usage && typeof usage.promptTokens === "number" && typeof usage.completionTokens === "number") {
      // OpenAI-compatible usage: completion_tokens ALREADY includes reasoning
      // tokens (reasoning_tokens is a subset breakdown) - adding both would
      // bill the reasoning twice. Bill completion_tokens as reported.
      actual =
        (usage.promptTokens / 1_000_000) * cfg.priceInputPerMillion +
        (usage.completionTokens / 1_000_000) * cfg.priceOutputPerMillion;
    }
    entry.status = "closed";
    entry.actualUsd = actual;
    if (note) entry.note = note;
    saveLedger(cfg.ledgerPath, ledger);
  });
}

export interface BudgetStatus {
  ceilingUsd: number;
  effectiveSpendUsd: number;
  closedActualUsd: number;
  openReservedUsd: number;
  remainingUsd: number;
  entries: number;
  openCalls: number;
}

export async function budgetStatus(cfg: BudgetConfig): Promise<BudgetStatus> {
  return withLock(cfg.ledgerPath, () => {
    const ledger = loadLedger(cfg.ledgerPath);
    const closed = ledger.entries.filter((e) => e.status === "closed");
    const open = ledger.entries.filter((e) => e.status === "open");
    const closedActualUsd = closed.reduce((s, e) => s + (e.actualUsd ?? e.reservedUsd), 0);
    const openReservedUsd = open.reduce((s, e) => s + e.reservedUsd, 0);
    const effective = closedActualUsd + openReservedUsd;
    const ceiling = Math.min(cfg.ceilingUsd, ledger.ceilingUsd ?? cfg.ceilingUsd);
    return {
      ceilingUsd: ceiling,
      effectiveSpendUsd: effective,
      closedActualUsd,
      openReservedUsd,
      remainingUsd: Math.max(0, ceiling - effective),
      entries: ledger.entries.length,
      openCalls: open.length
    };
  });
}

if (process.argv[1] && process.argv[1].endsWith("llm-budget.ts")) {
  const cfg = loadBudgetConfig();
  if (process.argv[2] === "status") {
    const status = await budgetStatus(cfg);
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log("usage: tsx scripts/llm-budget.ts status");
  }
}
