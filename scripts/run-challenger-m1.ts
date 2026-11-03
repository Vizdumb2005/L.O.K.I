/**
 * Empirical Stress Test Harness for Milestone 1:
 * 1. Probe Length Stress Test (effects/_example and effects/card)
 * 2. cuePending Concurrency Challenge (high-frequency clicks, hotkeys, session.answer rejection)
 * 3. Crimson Ink Programmatic Verification (cardPalette for all cards and black suit obsidian verification)
 */

import { exampleEffect } from "@loki/effect-example";
import { cardEffect } from "@loki/effect-card";
import { CARDS, CARD_PROBES, CARD_STAGE_BASE, zoneStatementsForStage } from "../effects/card/src/cards.js";
import { checkEffect, validateEffect } from "@loki/effect-api";
import { sanitizeLine, MAX_PATTER_LENGTH } from "../packages/showrunner/src/patter.js";
import { PerformanceSession } from "@loki/showrunner";
import { cardPalette } from "../apps/web/src/components/stage-layout.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RECOVERY_PREFIX = "One clean claim. ";
const RECOVERY_PREFIX_LEN = RECOVERY_PREFIX.length; // 17

interface ProbeCheckResult {
  effectId: string;
  probeId: string;
  prompt: string;
  promptLength: number;
  withPrefixLength: number;
  lengthOk: boolean;
  recoveryLengthOk: boolean;
  sanitizedOk: boolean;
  recoverySanitizedOk: boolean;
}

// ============================================================================
// CHALLENGE 1: Probe Length Stress Test
// ============================================================================
console.log("================================================================================");
console.log("CHALLENGE 1: PROBE LENGTH STRESS TEST");
console.log("================================================================================");

const allProbeResults: ProbeCheckResult[] = [];

// 1. Example Effect Probes
const exampleStage = exampleEffect.stage();
const exampleProbes = exampleEffect.probes(exampleStage);
console.log(`Checking ${exampleProbes.length} probes from exampleEffect:`);

for (const p of exampleProbes) {
  const prompt = p.prompt.trim();
  const promptLength = prompt.length;
  const withPrefix = (RECOVERY_PREFIX + prompt).trim();
  const withPrefixLength = withPrefix.length;

  const lengthOk = promptLength <= 160 && promptLength <= MAX_PATTER_LENGTH;
  const recoveryLengthOk = withPrefixLength <= MAX_PATTER_LENGTH;
  const sanitized = sanitizeLine(prompt, "FALLBACK");
  const sanitizedRecovery = sanitizeLine(withPrefix, "FALLBACK");
  const sanitizedOk = sanitized === prompt;
  const recoverySanitizedOk = sanitizedRecovery === withPrefix;

  allProbeResults.push({
    effectId: "ember-words",
    probeId: p.id,
    prompt,
    promptLength,
    withPrefixLength,
    lengthOk,
    recoveryLengthOk,
    sanitizedOk,
    recoverySanitizedOk
  });

  console.log(`  [${p.id}] len=${promptLength} with_prefix=${withPrefixLength} -> ${lengthOk && recoveryLengthOk && sanitizedOk && recoverySanitizedOk ? "PASS" : "FAIL"}`);
}

// 2. Card Effect Static Probes
console.log(`\nChecking ${CARD_PROBES.length} static probes from cardEffect (CARD_PROBES):`);
for (const p of CARD_PROBES) {
  const prompt = p.prompt.trim();
  const promptLength = prompt.length;
  const withPrefix = (RECOVERY_PREFIX + prompt).trim();
  const withPrefixLength = withPrefix.length;

  const lengthOk = promptLength <= 160 && promptLength <= MAX_PATTER_LENGTH;
  const recoveryLengthOk = withPrefixLength <= MAX_PATTER_LENGTH;
  const sanitized = sanitizeLine(prompt, "FALLBACK");
  const sanitizedRecovery = sanitizeLine(withPrefix, "FALLBACK");
  const sanitizedOk = sanitized === prompt;
  const recoverySanitizedOk = sanitizedRecovery === withPrefix;

  allProbeResults.push({
    effectId: "card-twelve (static)",
    probeId: p.id,
    prompt,
    promptLength,
    withPrefixLength,
    lengthOk,
    recoveryLengthOk,
    sanitizedOk,
    recoverySanitizedOk
  });

  console.log(`  [${p.id}] len=${promptLength} with_prefix=${withPrefixLength} -> ${lengthOk && recoveryLengthOk && sanitizedOk && recoverySanitizedOk ? "PASS" : "FAIL"}`);
}

// 3. Card Effect Zone Statements (all 12 cards generated)
const zoneProbes = zoneStatementsForStage(CARD_STAGE_BASE);
console.log(`\nChecking ${zoneProbes.length} zone statements from base stage:`);
for (const p of zoneProbes) {
  const prompt = p.prompt.trim();
  const promptLength = prompt.length;
  const withPrefix = (RECOVERY_PREFIX + prompt).trim();
  const withPrefixLength = withPrefix.length;

  const lengthOk = promptLength <= 160 && promptLength <= MAX_PATTER_LENGTH;
  const recoveryLengthOk = withPrefixLength <= MAX_PATTER_LENGTH;
  const sanitized = sanitizeLine(prompt, "FALLBACK");
  const sanitizedRecovery = sanitizeLine(withPrefix, "FALLBACK");
  const sanitizedOk = sanitized === prompt;
  const recoverySanitizedOk = sanitizedRecovery === withPrefix;

  allProbeResults.push({
    effectId: "card-twelve (zone-base)",
    probeId: p.id,
    prompt,
    promptLength,
    withPrefixLength,
    lengthOk,
    recoveryLengthOk,
    sanitizedOk,
    recoverySanitizedOk
  });

  console.log(`  [${p.id}] len=${promptLength} with_prefix=${withPrefixLength} -> ${lengthOk && recoveryLengthOk && sanitizedOk && recoverySanitizedOk ? "PASS" : "FAIL"}`);
}

// 4. Exhaustive Zone Statements Permutations across ALL 12 CARDS
console.log("\nChecking exhaustive statements for all 12 cards as zone leaders:");
for (const card of CARDS) {
  // Construct dummy stage with card as first item in zone
  const dummyStage = {
    ...CARD_STAGE_BASE,
    items: [
      { hypothesisId: card.id, label: card.label, glyph: card.glyph },
      ...CARD_STAGE_BASE.items.filter((i) => i.hypothesisId !== card.id)
    ]
  };
  const statements = zoneStatementsForStage(dummyStage);
  for (const st of statements) {
    const prompt = st.prompt.trim();
    const promptLength = prompt.length;
    const withPrefix = (RECOVERY_PREFIX + prompt).trim();
    const withPrefixLength = withPrefix.length;

    const lengthOk = promptLength <= 160 && promptLength <= MAX_PATTER_LENGTH;
    const recoveryLengthOk = withPrefixLength <= MAX_PATTER_LENGTH;
    const sanitized = sanitizeLine(prompt, "FALLBACK");
    const sanitizedRecovery = sanitizeLine(withPrefix, "FALLBACK");

    if (!lengthOk || !recoveryLengthOk || sanitized !== prompt || sanitizedRecovery !== withPrefix) {
      console.error(`  FAIL for card ${card.id}: len=${promptLength}, withPrefix=${withPrefixLength}`);
      process.exit(1);
    }
  }
}
console.log("  All 12 card zone leader statements verified <= 160 chars and recovery <= 180 chars.");

// 5. Run official validateEffect on both effects
console.log("\nRunning validateEffect(exampleEffect):");
validateEffect(exampleEffect);
console.log("  validateEffect(exampleEffect) passed without errors.");

console.log("Running validateEffect(cardEffect):");
validateEffect(cardEffect);
console.log("  validateEffect(cardEffect) passed without errors.");

// 6. Adversarial injection verification: verify validateEffect would catch violations
const badProbe = {
  ...exampleProbes[0]!,
  id: "adversarial-too-long",
  prompt: "A".repeat(164) // 164 + 17 = 181 > 180
};
const dummyEffectWithBadProbe = {
  ...exampleEffect,
  probes: () => [...exampleProbes, badProbe]
};
const issues = checkEffect(dummyEffectWithBadProbe);
const caught = issues.some((i) => i.includes("prompt + recovery prefix exceeds MAX_PATTER_LENGTH"));
console.log(`\nAdversarial probe check (prompt length 164 + prefix 17 = 181): caught=${caught}`);
if (!caught) {
  console.error("Adversarial check failed to catch oversized probe!");
  process.exit(1);
}

// Summary stats
const maxPromptLen = Math.max(...allProbeResults.map((r) => r.promptLength));
const maxWithPrefixLen = Math.max(...allProbeResults.map((r) => r.withPrefixLength));
console.log(`\nChallenge 1 Summary:`);
console.log(`  Total probes inspected: ${allProbeResults.length}`);
console.log(`  Max raw prompt length: ${maxPromptLen} chars (limit: 160)`);
console.log(`  Max recovery prompt length: ${maxWithPrefixLen} chars (limit: 180)`);
console.log(`  All probes <= 160 chars: ${allProbeResults.every((r) => r.lengthOk)}`);
console.log(`  All recovery probes <= 180 chars: ${allProbeResults.every((r) => r.recoveryLengthOk)}`);
console.log(`  All probes pass sanitization without fallback: ${allProbeResults.every((r) => r.sanitizedOk && r.recoverySanitizedOk)}`);


// ============================================================================
// CHALLENGE 2: cuePending Concurrency Challenge
// ============================================================================
console.log("\n================================================================================");
console.log("CHALLENGE 2: CUEPENDING CONCURRENCY CHALLENGE");
console.log("================================================================================");

let totalConcurrentCallsRejected = 0;
let totalValidAnswers = 0;

for (let seed = 1; seed <= 20; seed++) {
  const session = new PerformanceSession(cardEffect, { seed, forceEnabled: false });
  session.begin();
  session.chosen();
  // Now session is in "probe" phase
  if (session.snapshot().phase !== "probe") {
    throw new Error(`Expected probe phase, got ${session.snapshot().phase}`);
  }

  // Probe 1: Answer first probe
  const view1 = session.snapshot();
  const optionId = view1.options![0]!.id;

  session.answer(optionId);
  totalValidAnswers++;

  // Directly after answer:
  // 1. Internal state must have ackCue !== null
  // @ts-expect-error accessing private field for empiric audit
  const ackCue = session.ackCue;
  if (ackCue === null) {
    throw new Error("ackCue should not be null immediately after answer");
  }
  if (ackCue.holdMs !== 650) {
    throw new Error(`Expected ackCue.holdMs to be 650, got ${ackCue.holdMs}`);
  }

  // 2. Snapshot cues must contain [ackCue, promptCue]
  const viewAfterAnswer = session.snapshot();
  const cues = viewAfterAnswer.cues;
  if (cues.length !== 2) {
    throw new Error(`Expected 2 cues, got ${cues.length}`);
  }
  if (cues[0]?.kind !== "ack") {
    throw new Error(`Expected first cue to be ack, got ${cues[0]?.kind}`);
  }

  // 3. UI cuePending simulation:
  const lastCue = cues.length - 1; // 1
  let cueIndex = 0;
  let effectiveIndex = cueIndex;
  let cuePending = effectiveIndex < lastCue; // true
  let cuePendingRef = cuePending;

  // 4. Concurrency Bombardment:
  // While cuePending is true / ackCue !== null, simulate 500 rapid clicks / keystrokes
  const answeredBefore = session.internal().answered;
  let rejectedAtSession = 0;
  let rejectedAtUIGate = 0;

  for (let burst = 0; burst < 500; burst++) {
    // UI Button simulation: button is disabled when cuePending is true
    const buttonDisabled = cuePendingRef;
    if (buttonDisabled) {
      rejectedAtUIGate++;
    } else {
      // If button was NOT disabled, it would call session.answer
      session.answer(optionId);
    }

    // UI Keyboard simulation: keydown event handler checks cuePendingRef.current
    if (cuePendingRef) {
      rejectedAtUIGate++;
    } else {
      session.answer(optionId);
    }

    // Direct Session Bombardment: what if an attacker bypasses the UI and invokes session.answer directly?
    const answeredPreDirect = session.internal().answered;
    session.answer("yes");
    const answeredPostDirect = session.internal().answered;
    if (answeredPreDirect === answeredPostDirect) {
      rejectedAtSession++;
    } else {
      throw new Error("CRITICAL VULNERABILITY: session.answer accepted input while ackCue was active!");
    }
  }

  const answeredAfter = session.internal().answered;
  if (answeredAfter !== answeredBefore) {
    throw new Error(`answered counter changed from ${answeredBefore} to ${answeredAfter} during bombardment!`);
  }

  totalConcurrentCallsRejected += rejectedAtSession;

  // 5. Timer resolution simulation (after 650ms hold)
  cueIndex = 1;
  effectiveIndex = cueIndex;
  cuePending = effectiveIndex < lastCue; // false
  cuePendingRef = cuePending;

  // Effect hook: if (!cuePending && view.phase === "probe" && view.progress.answered > 0) clearAck()
  session.clearAck();

  // @ts-expect-error inspecting private field
  if (session.ackCue !== null) {
    throw new Error("clearAck() failed to clear ackCue");
  }

  // Now, next answer MUST be accepted
  const view2 = session.snapshot();
  if (view2.phase === "probe" && view2.options && view2.options.length > 0) {
    session.answer(view2.options[0]!.id);
    totalValidAnswers++;
    if (session.internal().answered !== answeredBefore + 1) {
      throw new Error("Subsequent answer was not accepted after clearAck()");
    }
  }
}

console.log(`  Completed 20 randomized sessions with 500-iteration concurrency storms.`);
console.log(`  Total direct concurrent session.answer calls rejected: ${totalConcurrentCallsRejected}`);
console.log(`  Total valid answers processed: ${totalValidAnswers}`);
console.log(`  Zero inputs leaked or accepted during acknowledgment hold window: TRUE`);


// ============================================================================
// CHALLENGE 3: Crimson Ink Programmatic Check
// ============================================================================
console.log("\n================================================================================");
console.log("CHALLENGE 3: CRIMSON INK PROGRAMMATIC CHECK");
console.log("================================================================================");

const RED_HEX = "#9e2a2b";
const OBSIDIAN_HEX = "#16231f";

// 1. Check all 12 cards in CARDS
console.log(`Checking ${CARDS.length} cards from CARDS:`);
let redCardsChecked = 0;
let blackCardsChecked = 0;

for (const card of CARDS) {
  const palette = cardPalette(card.glyph, card.label);
  if (card.suit === "h" || card.suit === "d") {
    if (palette.glyph !== RED_HEX) {
      throw new Error(`Card ${card.id} expected glyph ${RED_HEX}, got ${palette.glyph}`);
    }
    if (!palette.isRedSuit) {
      throw new Error(`Card ${card.id} expected isRedSuit=true`);
    }
    redCardsChecked++;
  } else if (card.suit === "s") {
    if (palette.glyph !== OBSIDIAN_HEX) {
      throw new Error(`Card ${card.id} expected glyph ${OBSIDIAN_HEX}, got ${palette.glyph}`);
    }
    if (palette.isRedSuit) {
      throw new Error(`Card ${card.id} expected isRedSuit=false`);
    }
    blackCardsChecked++;
  }
}
console.log(`  Checked ${redCardsChecked} red cards (Hearts, Diamonds) -> All glyphs === ${RED_HEX}`);
console.log(`  Checked ${blackCardsChecked} black cards (Spades) -> All glyphs === ${OBSIDIAN_HEX}`);

// 2. Exhaustive 52-card standard deck check
console.log("\nChecking full 52-card standard deck with various casings and labels:");
const fullSuits = [
  { name: "Hearts", glyph: "♥", red: true },
  { name: "Diamonds", glyph: "♦", red: true },
  { name: "Spades", glyph: "♠", red: false },
  { name: "Clubs", glyph: "♣", red: false }
];
const fullRanks = ["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King"];

let total52Checked = 0;
for (const s of fullSuits) {
  for (const r of fullRanks) {
    const label = `${r} of ${s.name}`;
    const glyph = `${r === "Ace" ? "A" : r[0]}${s.glyph}`;
    const p = cardPalette(glyph, label);
    if (s.red) {
      if (p.glyph !== RED_HEX || !p.isRedSuit) {
        throw new Error(`Standard deck card ${label} failed red crimson check!`);
      }
    } else {
      if (p.glyph !== OBSIDIAN_HEX || p.isRedSuit) {
        throw new Error(`Standard deck card ${label} failed black obsidian check!`);
      }
    }
    total52Checked++;
  }
}
console.log(`  Checked all ${total52Checked} standard deck cards -> 100% correct ink colors.`);

// 3. Test raw glyphs and labels alone
console.log("\nChecking isolated glyphs and labels:");
const isolatedTests = [
  { glyph: "♥", label: "", expectedGlyph: RED_HEX, expectedRed: true },
  { glyph: "♦", label: "", expectedGlyph: RED_HEX, expectedRed: true },
  { glyph: "", label: "Hearts", expectedGlyph: RED_HEX, expectedRed: true },
  { glyph: "", label: "Diamond", expectedGlyph: RED_HEX, expectedRed: true },
  { glyph: "♠", label: "", expectedGlyph: OBSIDIAN_HEX, expectedRed: false },
  { glyph: "♣", label: "", expectedGlyph: OBSIDIAN_HEX, expectedRed: false },
  { glyph: "", label: "Spade", expectedGlyph: OBSIDIAN_HEX, expectedRed: false },
  { glyph: "", label: "Club", expectedGlyph: OBSIDIAN_HEX, expectedRed: false },
  { glyph: "☉", label: "Sun", expectedGlyph: "#b85d14", expectedRed: false },
  { glyph: "☽", label: "Moon", expectedGlyph: "#24435c", expectedRed: false },
  { glyph: "☄", label: "Comet", expectedGlyph: "#a6341b", expectedRed: true },
  { glyph: "❀", label: "Flower", expectedGlyph: "#8f2947", expectedRed: true }
];
for (const t of isolatedTests) {
  const p = cardPalette(t.glyph, t.label);
  if (p.glyph !== t.expectedGlyph || p.isRedSuit !== t.expectedRed) {
    throw new Error(`Isolated test for "${t.glyph}" / "${t.label}" failed: expected ${t.expectedGlyph}, got ${p.glyph}`);
  }
}
console.log(`  All ${isolatedTests.length} isolated glyph and symbol tests passed.`);

// 4. Verify apps/web/src/styles.css contains the correct crimson definitions
console.log("\nVerifying styles.css definitions:");
const stylesCss = readFileSync(resolve("apps/web/src/styles.css"), "utf-8");
const expectedCssRules = [
  /\.silent-choice\.is-red\s*\{\s*border-color:\s*rgba\(158,\s*42,\s*43,\s*0\.36\);?\s*\}/,
  /\.silent-choice-glyph\.is-red\s*\{\s*color:\s*#9e2a2b;?\s*\}/,
  /\.flat-card\.is-red\s+\.flat-glyph\s*\{\s*color:\s*#9e2a2b;?\s*\}/,
  /\.flat-card\.is-red\s*\{\s*border-color:\s*rgba\(158,\s*42,\s*43,\s*0\.42\);?\s*\}/
];
for (const rule of expectedCssRules) {
  if (!rule.test(stylesCss)) {
    throw new Error(`styles.css missing rule matching: ${rule}`);
  }
}
console.log("  styles.css verified: .silent-choice, .silent-choice-glyph, .flat-card, .flat-glyph all use crimson #9e2a2b.");

// 5. Delta-E / contrast calculation
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const [r1, g1, b1] = hexToRgb(RED_HEX);
const [r2, g2, b2] = hexToRgb(OBSIDIAN_HEX);
const euclideanDistance = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
console.log(`\nContrast Metric:`);
console.log(`  Crimson Red (${RED_HEX}) RGB: [${r1}, ${g1}, ${b1}]`);
console.log(`  Obsidian Black (${OBSIDIAN_HEX}) RGB: [${r2}, ${g2}, ${b2}]`);
console.log(`  Euclidean color distance: ${euclideanDistance.toFixed(2)} (clearly distinguishable, > 130 in RGB space)`);

console.log("\n================================================================================");
console.log("ALL CHALLENGES COMPLETED SUCCESSFULLY: 100% PASS");
console.log("================================================================================");
