import {
  applyAnswer,
  applyChannelEvidence,
  bestHypothesis,
  beliefConfigFromEffect,
  beliefEntropy,
  commitGate,
  createBelief,
  maxPosterior,
  posteriorMap,
  resolveContradiction,
  selectProbe,
  type BeliefConfig,
  type BeliefState,
  type PolicyId
} from "@loki/engine";
import type {
  ChannelBinding,
  Effect,
  Evidence,
  Hypothesis,
  Probe,
  StageSpec
} from "@loki/effect-api";
import { validateEffect } from "@loki/effect-api";
import { sanitizeLine } from "./patter.js";

export type SessionPhase =
  | "invite"
  | "think"
  | "attune"
  | "probe"
  | "recover"
  | "build"
  | "reveal"
  | "miss"
  | "afterglow"
  | "done";

export interface SessionOptions {
  seed?: number;
  policy?: PolicyId;
  cameraEnabled?: boolean;
  /** A human/pilot validation must explicitly pass this; the lab does not. */
  cameraValidated?: boolean;
  forceEnabled?: boolean;
  now?: () => number;
  /** Simulator-only ablations. The app never supplies hardMode. */
  beliefOverrides?: Partial<BeliefConfig>;
}

export interface SessionView {
  phase: SessionPhase;
  line: string;
  caption: string;
  prompt?: string;
  probeId?: string;
  options?: Array<{ id: string; label: string }>;
  beat: string;
  progress: { answered: number; max: number };
  resonance: number;
  reveal?: { id: string; label: string; glyph?: string; probability: number };
  stage: StageSpec;
  camera: { enabled: boolean; validated: boolean; active: boolean; windowsUsed: number };
  canAdvance: boolean;
  canAnswer: boolean;
  finished: boolean;
}

export interface SessionExport {
  version: 1;
  effectId: string;
  layoutSeed: number;
  policy: PolicyId;
  camera: { enabled: boolean; validated: boolean; windowsUsed: number };
  forceEnabled: boolean;
  observations: Array<{
    channel: string;
    value: string;
    probeId?: string;
    reliability: number;
    at: number;
    surprise: number;
    posterior: number[];
  }>;
  finalPhase: SessionPhase;
  revealed?: { id: string; confidence: number };
  note: string;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function initialLine(effect: Effect): string {
  const beat = effect.script().beats.find((b) => b.kind === "invite");
  return beat?.line ?? "Welcome. This is a performance of mentalism.";
}

export class PerformanceSession {
  readonly effect: Effect;
  readonly config: BeliefConfig;
  readonly stage: StageSpec;
  readonly policy: PolicyId;
  readonly layoutSeed: number;
  readonly cameraRequested: boolean;
  readonly cameraValidated: boolean;
  readonly forceEnabled: boolean;

  private belief: BeliefState;
  private channels: ChannelBinding[];
  private probes: Probe[];
  private phase: SessionPhase = "invite";
  private line: string;
  private promptProbe: Probe | null = null;
  private used = new Set<string>();
  private answered = 0;
  private recoveryLeft: number;
  private inRecovery = false;
  private revealCandidate: { hypothesis: Hypothesis; probability: number } | null = null;
  private cameraActive = false;
  private gazeWindows = 0;
  private recoveryCount = 0;
  private startedAt: number;
  private nowFn: () => number;
  private lastAt = 0;

  constructor(
    effect: Effect,
    private readonly options: SessionOptions = {}
  ) {
    validateEffect(effect);
    this.effect = effect;
    this.config = { ...beliefConfigFromEffect(effect.config), ...(options.beliefOverrides ?? {}) };
    this.layoutSeed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.policy = options.policy ?? "greedy";
    this.cameraRequested = options.cameraEnabled === true;
    this.cameraValidated = options.cameraValidated === true && options.cameraEnabled === true;
    this.forceEnabled = options.forceEnabled === true;
    this.recoveryLeft = effect.config.recoveryBudget;
    this.probes = effect.probes();
    this.nowFn = options.now ?? (() => Date.now());
    this.startedAt = this.nowFn();
    const baseStage = effect.stage();
    const random = mulberry32(this.layoutSeed);
    this.stage = { ...baseStage, items: shuffled(baseStage.items, random) };
    this.channels = effect.channels(this.stage);
    const prior = effect.prior({ forceEnabled: this.forceEnabled });
    this.belief = createBelief(effect.hypotheses(), prior, this.config);
    this.line = initialLine(effect);
  }

  get phaseName(): SessionPhase {
    return this.phase;
  }

  begin(): void {
    if (this.phase !== "invite") return;
    this.phase = "think";
    this.line = this.lineFor("think", "Choose one. Hold it quietly. I will not ask you to say it.");
  }

  consent(): void {
    this.begin();
  }

  /** Called after the spectator has silently chosen an item. */
  chosen(): void {
    if (this.phase !== "think") return;
    if (this.cameraValidated) {
      this.cameraActive = true;
      this.phase = "attune";
      this.line = this.lineFor("attune", "Let the room settle. Look where you like; nothing is recorded.");
    } else {
      this.startProbing();
    }
  }

  finishAttune(): void {
    if (this.phase !== "attune") return;
    this.releaseCamera();
    this.startProbing();
  }

  /**
   * Add one aggregated gaze window. Individual frames must never reach this method.
   * Gaze is ignored unless the camera was explicitly validated for this show.
   */
  addGaze(window: { zone: string; reliability: number; at?: number }): boolean {
    if (!this.cameraValidated || !this.cameraActive || this.gazeWindows >= 2) return false;
    const binding = this.channels.find((c) => c.channel === "gaze");
    if (!binding) return false;
    const at = window.at ?? this.tick();
    const evidence: Evidence = {
      channel: "gaze",
      value: window.zone,
      reliability: window.reliability,
      at,
      meta: { aggregated: true }
    };
    const result = applyChannelEvidence(this.belief, binding, evidence, this.config);
    this.belief = result.state;
    if (result.dropped) return false;
    this.gazeWindows += 1;
    if (result.contradiction) {
      this.belief = resolveContradiction(this.belief);
    }
    return true;
  }

  releaseCamera(): void {
    this.cameraActive = false;
  }

  get cameraOn(): boolean {
    return this.cameraActive;
  }

  answer(optionId: string): void {
    if (this.phase !== "probe" || !this.promptProbe) {
      throw new Error(`cannot answer in phase ${this.phase}`);
    }
    const result = applyAnswer(
      this.belief,
      this.promptProbe,
      optionId,
      this.config,
      this.tick(),
      1
    );
    this.belief = result.state;
    this.answered += 1;
    this.used.add(this.promptProbe.id);
    this.promptProbe = null;

    if (result.contradiction && !this.inRecovery) {
      // Resolve the flag now; the recovery probe is the response to the surprise.
      this.belief = resolveContradiction(this.belief);
      this.enterRecovery();
      return;
    }

    if (commitGate(this.belief, this.effect.config.commitThreshold, this.answered)) {
      this.freezeAndBuild();
      return;
    }

    if (this.answered >= this.effect.config.maxProbes) {
      if (!this.inRecovery && this.recoveryLeft > 0) {
        this.enterRecovery();
      } else {
        this.miss();
      }
      return;
    }
    this.startProbing();
  }

  advance(): void {
    switch (this.phase) {
      case "invite":
        this.begin();
        return;
      case "think":
        this.chosen();
        return;
      case "attune":
        this.finishAttune();
        return;
      case "recover":
        this.startRecoveryProbe();
        return;
      case "build":
        this.doReveal();
        return;
      case "reveal":
      case "miss":
        this.phase = "afterglow";
        this.line = sanitizeLine(
          this.lineFor("afterglow", "The show is over. The choice was always yours."),
          "The show is over. The choice was always yours."
        );
        return;
      case "afterglow":
        this.phase = "done";
        this.releaseCamera();
        return;
      default:
        throw new Error(`cannot advance in phase ${this.phase}`);
    }
  }

  snapshot(): SessionView {
    const entropy = beliefEntropy(this.belief);
    const maxEntropy = Math.log2(this.belief.hypotheses.length);
    return {
      phase: this.phase,
      line: this.line,
      caption: this.line,
      prompt: this.phase === "probe" ? this.promptProbe?.prompt : undefined,
      probeId: this.phase === "probe" ? this.promptProbe?.id : undefined,
      options: this.phase === "probe" ? this.promptProbe?.options.map((o) => ({ ...o })) : undefined,
      beat: this.phase,
      progress: { answered: this.answered, max: this.effect.config.maxProbes },
      resonance: maxEntropy > 0 ? 1 - entropy / maxEntropy : 1,
      reveal: this.revealCandidate && (this.phase === "reveal" || this.phase === "afterglow")
        ? {
            id: this.revealCandidate.hypothesis.id,
            label: this.revealCandidate.hypothesis.label,
            glyph: this.revealCandidate.hypothesis.glyph,
            probability: this.revealCandidate.probability
          }
        : undefined,
      stage: this.stage,
      camera: {
        enabled: this.cameraRequested,
        validated: this.cameraValidated,
        active: this.cameraActive,
        windowsUsed: this.gazeWindows
      },
      canAdvance: ["invite", "think", "attune", "recover", "build", "reveal", "miss", "afterglow"].includes(
        this.phase
      ),
      canAnswer: this.phase === "probe",
      finished: this.phase === "done"
    };
  }

  /** For tests and the simulator. The UI must not render these numbers as mind reading. */
  internal(): {
    phase: SessionPhase;
    answered: number;
    belief: BeliefState;
    posterior: Record<string, number>;
    confidence: number;
    revealedId?: string;
    cameraOn: boolean;
    gazeWindows: number;
    recoveries: number;
  } {
    return {
      phase: this.phase,
      answered: this.answered,
      belief: this.belief,
      posterior: posteriorMap(this.belief),
      confidence: maxPosterior(this.belief),
      revealedId: this.revealCandidate?.hypothesis.id,
      cameraOn: this.cameraActive,
      gazeWindows: this.gazeWindows,
      recoveries: this.recoveryCount
    };
  }

  exportLog(): SessionExport {
    return {
      version: 1,
      effectId: this.effect.id,
      layoutSeed: this.layoutSeed,
      policy: this.policy,
      camera: {
        enabled: this.cameraRequested,
        validated: this.cameraValidated,
        windowsUsed: this.gazeWindows
      },
      forceEnabled: this.forceEnabled,
      observations: this.belief.observations.map((o) => ({
        channel: o.evidence.channel,
        value: o.evidence.value,
        probeId: o.evidence.probeId,
        reliability: o.evidence.reliability,
        at: o.evidence.at,
        surprise: o.surprise,
        posterior: o.posterior
      })),
      finalPhase: this.phase,
      revealed: this.revealCandidate && (this.phase === "reveal" || this.phase === "afterglow")
        ? { id: this.revealCandidate.hypothesis.id, confidence: this.revealCandidate.probability }
        : undefined,
      note: "Categorical evidence only. No camera frames, images, audio, or identity data."
    };
  }

  private tick(): number {
    const at = Math.max(this.lastAt, this.nowFn() - this.startedAt);
    this.lastAt = at;
    return at;
  }

  private lineFor(kind: string, fallback: string): string {
    const beat = this.effect.script().beats.find((b) => b.kind === kind);
    return sanitizeLine(beat?.line ?? fallback, fallback);
  }

  private startProbing(): void {
    this.cameraActive = false;
    const choice = selectProbe(
      this.belief,
      this.probes,
      this.used,
      this.policy,
      this.config,
      this.effect.config.costWeight
    );
    if (!choice) {
      if (commitGate(this.belief, this.effect.config.commitThreshold, this.answered)) {
        this.freezeAndBuild();
      } else {
        this.miss();
      }
      return;
    }
    this.phase = "probe";
    this.promptProbe = choice.probe;
    this.line = sanitizeLine(choice.probe.prompt, "One more question. What feels true?");
  }

  private enterRecovery(): void {
    if (this.recoveryLeft <= 0) {
      this.miss();
      return;
    }
    this.recoveryLeft -= 1;
    this.recoveryCount += 1;
    this.phase = "recover";
    this.line = sanitizeLine(
      this.effect.script().recoverLine,
      "Two signals are fighting. Help me with one more step."
    );
  }

  private startRecoveryProbe(): void {
    const choice = selectProbe(
      this.belief,
      this.probes,
      this.used,
      "greedy",
      this.config,
      0
    );
    if (!choice) {
      this.miss();
      return;
    }
    this.inRecovery = true;
    this.phase = "probe";
    this.promptProbe = choice.probe;
    this.line = sanitizeLine(
      `One clean question. ${choice.probe.prompt}`,
      "One clean question. What feels true?"
    );
  }

  private freezeAndBuild(): void {
    const best = bestHypothesis(this.belief);
    this.revealCandidate = { hypothesis: best.hypothesis, probability: best.probability };
    this.phase = "build";
    const lines = this.effect.script().buildLines;
    const template = lines[this.answered % Math.max(1, lines.length)] ?? "It is becoming clear.";
    this.line = sanitizeLine(template.replace(/\{n\}/g, String(this.answered)), "It is becoming clear.");
  }

  private doReveal(): void {
    if (!this.revealCandidate) {
      this.miss();
      return;
    }
    this.phase = "reveal";
    const line = this.effect
      .script()
      .revealLine(this.revealCandidate.hypothesis, this.revealCandidate.probability);
    this.line = sanitizeLine(line, `It was ${this.revealCandidate.hypothesis.label}.`);
  }

  private miss(): void {
    this.phase = "miss";
    this.revealCandidate = null;
    this.line = sanitizeLine(
      this.effect.script().missLine,
      "You beat me. The choice stayed yours."
    );
  }
}

export function createSession(effect: Effect, options?: SessionOptions): PerformanceSession {
  return new PerformanceSession(effect, options);
}
