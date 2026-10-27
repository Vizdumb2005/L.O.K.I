import { findBannedClaim } from "./claims.js";
import type { Effect, Hypothesis, Probe } from "./types.js";

const EPS = 1e-6;

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

function checkProbe(probe: Probe, hypotheses: Hypothesis[], issues: string[]): void {
  if (!probe.id.trim()) issues.push("probe id is empty");
  if (!probe.prompt.trim()) issues.push(`probe ${probe.id} has an empty prompt`);
  if (probe.options.length < 2) issues.push(`probe ${probe.id} needs at least two options`);
  if (!Number.isFinite(probe.cost) || probe.cost < 0 || probe.cost > 1) {
    issues.push(`probe ${probe.id} cost must be 0..1`);
  }
  const optionIds = new Set<string>();
  for (const option of probe.options) {
    if (!option.id.trim()) issues.push(`probe ${probe.id} has an empty option id`);
    if (optionIds.has(option.id)) issues.push(`probe ${probe.id} has duplicate option ${option.id}`);
    optionIds.add(option.id);
    if (!option.label.trim()) issues.push(`probe ${probe.id}/${option.id} has an empty label`);
  }
  if (optionIds.size < 2) return;

  const optionMax = new Map<string, number>(probe.options.map((o) => [o.id, 0]));
  for (const h of hypotheses) {
    let sum = 0;
    const row: Array<[string, number]> = [];
    for (const option of probe.options) {
      const p = probe.likelihood(h.id, option.id);
      if (!Number.isFinite(p) || p < 0 || p > 1) {
        issues.push(`probe ${probe.id} likelihood for ${h.id}/${option.id} is not 0..1`);
        continue;
      }
      sum += p;
      row.push([option.id, p]);
      optionMax.set(option.id, Math.max(optionMax.get(option.id) ?? 0, p));
    }
    if (!close(sum, 1)) {
      issues.push(`probe ${probe.id} likelihood row for ${h.id} sums to ${sum.toFixed(4)}, not 1`);
    }
    const best = Math.max(...row.map(([, p]) => p));
    if (best < 0.5) {
      issues.push(`probe ${probe.id} is too uncertain for ${h.id} (max ${best.toFixed(3)} < 0.5)`);
    }
  }
  for (const option of probe.options) {
    if ((optionMax.get(option.id) ?? 0) < 0.25) {
      issues.push(`probe ${probe.id} option ${option.id} is never plausible; degenerate probe`);
    }
  }
}

export function checkEffect(effect: Effect): string[] {
  const issues: string[] = [];
  if (!effect.id.trim()) issues.push("effect id is empty");
  if (!effect.name.trim()) issues.push("effect name is empty");
  if (!effect.tagline.trim()) issues.push("effect tagline is empty");

  const hypotheses = effect.hypotheses();
  if (hypotheses.length < 2) issues.push("effect needs at least two hypotheses");
  const ids = new Set<string>();
  for (const h of hypotheses) {
    if (!h.id.trim()) issues.push("hypothesis id is empty");
    if (ids.has(h.id)) issues.push(`duplicate hypothesis id ${h.id}`);
    ids.add(h.id);
    if (!h.label.trim()) issues.push(`hypothesis ${h.id} has an empty label`);
  }

  const prior = effect.prior({ forceEnabled: false });
  let priorSum = 0;
  for (const id of ids) {
    const p = prior[id];
    if (p === undefined) {
      issues.push(`prior is missing hypothesis ${id}`);
      continue;
    }
    if (!Number.isFinite(p) || p < 0) issues.push(`prior for ${id} is not a non-negative number`);
    priorSum += p;
  }
  for (const key of Object.keys(prior)) {
    if (!ids.has(key)) issues.push(`prior has unknown hypothesis ${key}`);
  }
  if (!close(priorSum, 1)) issues.push(`prior sums to ${priorSum.toFixed(6)}, not 1`);

  const probes = effect.probes();
  if (probes.length < 2) issues.push("effect needs at least two probes");
  const probeIds = new Set<string>();
  for (const probe of probes) {
    if (probeIds.has(probe.id)) issues.push(`duplicate probe id ${probe.id}`);
    probeIds.add(probe.id);
    checkProbe(probe, hypotheses, issues);
  }

  const stage = effect.stage();
  const channels = effect.channels(stage);
  const channelIds = new Set<string>();
  for (const channel of channels) {
    if (channel.channel === "answer") {
      issues.push("do not bind the answer channel; core answers are defined by probes");
    }
    if (channelIds.has(channel.channel)) issues.push(`duplicate channel ${channel.channel}`);
    channelIds.add(channel.channel);
    if (!channel.label.trim()) issues.push(`channel ${channel.channel} has an empty label`);
    if (!(channel.weight > 0 && channel.weight <= 1)) {
      issues.push(`channel ${channel.channel} weight must be (0,1]`);
    }
    if (!(channel.minReliability >= 0 && channel.minReliability <= 1)) {
      issues.push(`channel ${channel.channel} minReliability must be 0..1`);
    }
    if (channel.values.length < 2) issues.push(`channel ${channel.channel} needs at least two values`);
    if (new Set(channel.values).size !== channel.values.length) {
      issues.push(`channel ${channel.channel} has duplicate values`);
    }
    for (const h of hypotheses) {
      let sum = 0;
      for (const value of channel.values) {
        const p = channel.likelihood(h.id, {
          channel: channel.channel,
          value,
          reliability: 1,
          at: 0
        });
        if (!Number.isFinite(p) || p < 0 || p > 1) {
          issues.push(`channel ${channel.channel} likelihood for ${h.id}/${value} is not 0..1`);
        }
        sum += p;
      }
      if (!close(sum, 1)) {
        issues.push(
          `channel ${channel.channel} likelihood row for ${h.id} sums to ${sum.toFixed(4)}, not 1`
        );
      }
    }
  }

  if (stage.renderer !== "grid") issues.push(`stage renderer ${stage.renderer} is not supported`);
  if (!Number.isInteger(stage.columns) || stage.columns < 1) issues.push("stage columns must be >= 1");
  if (!stage.title.trim()) issues.push("stage title is empty");
  if (!stage.instructions.trim()) issues.push("stage instructions are empty");
  const staged = new Set<string>();
  for (const item of stage.items) {
    if (!ids.has(item.hypothesisId)) issues.push(`stage item has unknown hypothesis ${item.hypothesisId}`);
    if (staged.has(item.hypothesisId)) issues.push(`stage has duplicate item ${item.hypothesisId}`);
    staged.add(item.hypothesisId);
  }
  for (const id of ids) {
    if (!staged.has(id)) issues.push(`stage is missing hypothesis ${id}`);
  }
  if (stage.zones) {
    const zoneIds = new Set<string>();
    for (const zone of stage.zones) {
      if (zoneIds.has(zone.id)) issues.push(`duplicate stage zone ${zone.id}`);
      zoneIds.add(zone.id);
      if (zone.x < 0 || zone.y < 0 || zone.w <= 0 || zone.h <= 0 || zone.x + zone.w > 1.000001 || zone.y + zone.h > 1.000001) {
        issues.push(`stage zone ${zone.id} is outside normalized bounds`);
      }
    }
  }

  const script = effect.script();
  const required = ["invite", "think", "build", "reveal", "afterglow"];
  for (const kind of required) {
    if (!script.beats.some((b) => b.kind === kind)) issues.push(`script is missing a ${kind} beat`);
  }
  const beatIds = new Set<string>();
  for (const beat of script.beats) {
    if (beatIds.has(beat.id)) issues.push(`duplicate beat id ${beat.id}`);
    beatIds.add(beat.id);
    if (!beat.line.trim()) issues.push(`beat ${beat.id} has an empty line`);
    const banned = findBannedClaim(beat.line);
    if (banned) issues.push(`beat ${beat.id} contains banned claim ${banned}`);
  }
  if (script.buildLines.length === 0) issues.push("script has no build lines");
  for (const line of script.buildLines) {
    const banned = findBannedClaim(line);
    if (banned) issues.push(`build line contains banned claim ${banned}`);
  }
  if (hypotheses[0]) {
    const sample = script.revealLine(hypotheses[0], 0.9);
    if (!sample.trim()) issues.push("revealLine returned an empty line");
    const banned = findBannedClaim(sample);
    if (banned) issues.push(`revealLine contains banned claim ${banned}`);
  }
  for (const [label, line] of [
    ["recoverLine", script.recoverLine],
    ["missLine", script.missLine]
  ] as const) {
    if (!line.trim()) issues.push(`${label} is empty`);
    const banned = findBannedClaim(line);
    if (banned) issues.push(`${label} contains banned claim ${banned}`);
  }

  const c = effect.config;
  if (!Number.isInteger(c.maxProbes) || c.maxProbes < 1 || c.maxProbes > 12) {
    issues.push("config.maxProbes must be an integer 1..12");
  }
  if (!(c.commitThreshold > 0.5 && c.commitThreshold < 1)) {
    issues.push("config.commitThreshold must be in (0.5,1)");
  }
  if (!Number.isInteger(c.recoveryBudget) || c.recoveryBudget < 0 || c.recoveryBudget > 3) {
    issues.push("config.recoveryBudget must be an integer 0..3");
  }
  if (!(c.recoverySurprise > 0)) issues.push("config.recoverySurprise must be > 0");
  if (!(c.epsilon >= 0.05 && c.epsilon <= 0.45)) issues.push("config.epsilon must be 0.05..0.45");
  if (!(c.outlierWeight >= 0 && c.outlierWeight <= 0.4)) {
    issues.push("config.outlierWeight must be 0..0.4");
  }
  if (!(c.temperature >= 0.5 && c.temperature <= 2)) {
    issues.push("config.temperature must be 0.5..2");
  }
  if (!(c.costWeight >= 0 && c.costWeight <= 1)) issues.push("config.costWeight must be 0..1");

  return issues;
}

export function validateEffect(effect: Effect): void {
  const issues = checkEffect(effect);
  if (issues.length > 0) {
    throw new Error(`Invalid effect ${effect.id}:\n- ${issues.join("\n- ")}`);
  }
}
