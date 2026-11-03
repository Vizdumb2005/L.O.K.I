import {
  applyAnswer,
  applyChannelEvidence,
  bestHypothesis,
  beliefConfigFromEffect,
  commitGate,
  createBelief,
  maxPosterior,
  posteriorMap,
  resolveContradiction,
  selectProbe,
  topHypotheses,
  type BeliefConfig,
  type BeliefState,
  type PolicyId
} from "@loki/engine";
import type {
  ChannelBinding,
  Effect,
  Evidence,
  ForceSpec,
  Hypothesis,
  Probe,
  SealedPrediction,
  StageSpec
} from "@loki/effect-api";
import { sealPrediction, validateEffect, verifySealedPrediction } from "@loki/effect-api";
import { sanitizeLine } from "./patter.js";
import { Performer, type Cue } from "./performer.js";

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
  /**
   * Presence mode: allows the attune beat (face presence only, no gaze
   * evidence). Does NOT open the gaze channel - addGaze still requires
   * cameraValidated. Presence is "a face is here", never card inference.
   */
  presenceEnabled?: boolean;
  forceEnabled?: boolean;
  now?: () => number;
  /** Simulator-only ablations. The app never supplies hardMode. */
  beliefOverrides?: Partial<BeliefConfig>;
}

export interface SessionView {
  phase: SessionPhase;
  line: string;
  /** Timed cues for the current moment. The last cue always equals `line` and rests. */
  cues: Cue[];
  caption: string;
  prompt?: string;
  probeId?: string;
  options?: Array<{ id: string; label: string }>;
  beat: string;
  /** Opaque interaction token. Increments when the performed beat changes. Never render it. */
  turn: number;
  /** SHA-256 commitment sealed before the first answer. Hash only; never the hypothesis or nonce before reveal. */
  sealedCommitment?: string;
  /** Opened seal, present only after reveal/miss: verbatim hypothesis, nonce, commitment and verification outcome. */
  sealedOpened?: { commitment: string; hypothesisId: string; nonce: string; verified: boolean };
  reveal?: { id: string; label: string; glyph?: string; probability: number };
  /**
   * CRIT-03: why the recover phase opened. "contradiction" only when the evidence
   * truly contradicted; "tie-break" when the probe budget ran out with two
   * candidates left. Never let a tie-break accuse an honest spectator.
   */
  recoveryReason: "contradiction" | "tie-break" | null;
  /**
   * Present during the reveal when the effect asks the person to perform the reveal
   * themselves: the stage stays dark behind `invite` until they take `action`.
   */
  revealGate?: { invite: string; action: string };
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
  sealed?: { commitment: string; hypothesisId: string; nonce: string; verified: boolean };
  note: string;
}

const TIE_GAP = 0.10;
const TIE_FLOOR = 0.20;
const HESITATE_GAP = 0.15;
const TIME_BRIEF_MAX_MS = 8000;
const TIME_SETTLED_MAX_MS = 25000;

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
  private pendingCandidate: { hypothesis: Hypothesis; probability: number } | null = null;
  private sealed: SealedPrediction | null = null;
  private forceSpec: ForceSpec | null = null;
  private sealedVerified: boolean | null = null;
  private nonceRandom: () => number = mulberry32(0);
  private chosenAt: number | null = null;
  private attuneEnterAt: number | null = null;
  private attuneDurationMs: number | null = null;
  private cameraActive = false;
  /**
   * Blueprint v4 §2.2: the attunement calibration opens this gate at runtime.
   * The UI calls validateCamera() only after the disguised ember calibration
   * passes its RMSE + quality gate; until then gaze evidence is refused.
   */
  private validatedCamera = false;
  private readonly presenceEnabled: boolean;
  private gazeWindows = 0;
  /** Zones observed through the gaze channel, most recent last (blueprint §3). */
  private gazedZones: string[] = [];
  private gazeReliabilities: number[] = [];
  private equivocationActive = false;
  private lastDenialPivot: string | null = null;
  private recoveryCount = 0;
  private recoveryReason: "contradiction" | "tie-break" | null = null;
  private startedAt: number;
  private performer: Performer;
  private pickedLabels: string[] = [];
  private pickedPairs: Array<{ label: string; prompt: string }> = [];
  private ackCue: Cue | null = null;
  private phaseCues: Cue[] | null = null;
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
    this.validatedCamera = options.cameraValidated === true && options.cameraEnabled === true;
    this.presenceEnabled = options.presenceEnabled === true;
    this.forceEnabled = options.forceEnabled === true;
    this.recoveryLeft = effect.config.recoveryBudget;
    this.nowFn = options.now ?? (() => Date.now());
    this.startedAt = this.nowFn();
    this.performer = new Performer(this.layoutSeed);
    this.nonceRandom = mulberry32(this.layoutSeed ^ 0x5eed);
    const baseStage = effect.stage();
    const random = mulberry32(this.layoutSeed);
    this.stage = { ...baseStage, items: shuffled(baseStage.items, random) };
    // Blueprint §3: zone-crafted statements are built from THIS show's shuffled
    // layout, exactly like the channel zone map above.
    this.probes = effect.probes(this.stage);
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
    this.chosenAt = this.tick();
    // Seal before any answer (and before attune/probing): commit to the declared
    // force target, if any. The seal is inert during probing; it never steers answers.
    const spec = this.effect.forceSpec?.({ forceEnabled: this.forceEnabled }) ?? null;
    if (spec && this.forceEnabled) {
      this.forceSpec = spec;
      let nonce = "";
      for (let i = 0; i < 16; i++) {
        nonce += Math.floor(this.nonceRandom() * 256).toString(16).padStart(2, "0");
      }
      this.sealed = sealPrediction(spec.targetId, nonce, this.tick());
    }
    if ((this.cameraValidated || this.presenceEnabled) && (this.presenceEnabled || this.gazeWindows === 0)) {
      this.attuneEnterAt = this.tick();
      this.cameraActive = true;
      this.phase = "attune";
      this.line = this.lineFor("attune", "Let the room settle. Look where you like; nothing is recorded.");
    } else {
      this.startProbing();
    }
  }

  finishAttune(): void {
    if (this.phase !== "attune") return;
    if (this.attuneEnterAt !== null) {
      this.attuneDurationMs = Math.max(0, this.tick() - this.attuneEnterAt);
    }
    this.releaseCamera();
    this.startProbing();
  }

  /**
   * Add one aggregated gaze window. Individual frames must never reach this method.
   * Gaze is ignored unless the camera was explicitly validated for this show.
   */
  addGaze(window: { zone: string; reliability: number; at?: number }): boolean {
    if (
      !this.cameraValidated ||
      (!this.cameraActive && this.phase !== "think" && this.phase !== "attune") ||
      this.gazeWindows >= 2
    ) {
      return false;
    }
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
    if (result.dropped) {
      if (window.reliability >= 0.10) {
        this.gazedZones.push(window.zone);
        this.gazeReliabilities.push(window.reliability);
      }
      return false;
    }
    this.belief = result.state;
    this.gazeWindows += 1;
    this.gazedZones.push(window.zone);
    this.gazeReliabilities.push(window.reliability);
    if (result.contradiction) {
      this.belief = resolveContradiction(this.belief);
    }
    return true;
  }

  getGazedZones(): string[] {
    return [...this.gazedZones];
  }

  private get isGazedOrEquivocation(): boolean {
    return (
      this.gazedZones.length > 0 ||
      this.gazeWindows > 0 ||
      this.equivocationActive ||
      this.used.has("card-equivocation-gesture") ||
      this.used.has("card-equivocation-secondary")
    );
  }

  private getGazedHypothesisIds(): Set<string> {
    const ids = new Set<string>();
    const stage = this.stage;
    const columns = stage.columns;
    stage.items.forEach((item, idx) => {
      const row = Math.floor(idx / columns);
      const col = idx % columns;
      const half = col < columns / 2 ? 0 : 1;
      const zoneId = stage.zones?.[row * 2 + half]?.id;
      if (zoneId && this.gazedZones.includes(zoneId)) {
        ids.add(item.hypothesisId);
      }
    });
    return ids;
  }

  get effectiveMaxProbes(): number {
    if (this.gazedZones.length > 0 || this.gazeWindows > 0) {
      return this.effect.config.maxProbesGazed ?? 2;
    }
    if (this.isGazedOrEquivocation) {
      return 2;
    }
    return this.effect.config.maxProbes;
  }

  teardown(): void {
    const prior = this.effect.prior({ forceEnabled: this.forceEnabled });
    this.belief = createBelief(this.effect.hypotheses(), prior, this.config);
    this.gazedZones = [];
    this.gazeReliabilities = [];
    this.pickedLabels = [];
    this.pickedPairs = [];
    this.used.clear();
    this.answered = 0;
    this.gazeWindows = 0;
    this.promptProbe = null;
    this.revealCandidate = null;
    this.pendingCandidate = null;
    this.sealed = null;
    this.forceSpec = null;
    this.sealedVerified = null;
    this.chosenAt = null;
    this.attuneEnterAt = null;
    this.attuneDurationMs = null;
    this.ackCue = null;
    this.phaseCues = null;
    this.cameraActive = false;
    this.phase = "done";
  }

  releaseCamera(): void {
    this.cameraActive = false;
  }

  get cameraValidated(): boolean {
    return this.validatedCamera;
  }

  /**
   * Blueprint v4 §2.2 — open the gaze gate for this show. Called by the UI only
   * after the disguised attunement calibration passes its residual gate. It is
   * idempotent and refuses when the camera was never enabled for this show.
   */
  validateCamera(): boolean {
    if (!this.cameraRequested) return false;
    this.validatedCamera = true;
    return true;
  }

  /**
   * CRIT-02: Clear the pending acknowledgment cue. The UI calls this after the
   * ack cue has been displayed for its hold duration, allowing the next answer.
   */
  clearAck(): void {
    this.ackCue = null;
  }

  get cameraOn(): boolean {
    return this.cameraActive;
  }

  answer(optionId: string): void {
    if (this.phase !== "probe" || !this.promptProbe) {
      throw new Error(`cannot answer in phase ${this.phase}`);
    }
    // CRIT-02 fix: reject input while the acknowledgment cue is still showing.
    // The spectator must see the new prompt before answering it.
    if (this.ackCue !== null) {
      return;
    }
    if (this.promptProbe.id === "card-equivocation-gesture") {
      if (optionId === "yes") optionId = "cast-black";
      if (optionId === "no") optionId = "keep-crimson";
    }
    let probeToApply = this.promptProbe;
    if (this.promptProbe.id === "card-equivocation-gesture" && this.gazedZones.length > 0) {
      const gazedHypothesisIds = this.getGazedHypothesisIds();
      probeToApply = {
        ...this.promptProbe,
        likelihood: (itemId: string, optId: string) => {
          if (gazedHypothesisIds.has(itemId)) return 1.0;
          return this.promptProbe!.likelihood(itemId, optId);
        }
      };
    }
    const result = applyAnswer(
      this.belief,
      probeToApply,
      optionId,
      this.config,
      this.tick(),
      1
    );
    this.belief = result.state;
    this.answered += 1;
    this.used.add(this.promptProbe.id);
    if (this.promptProbe.denialPivot && optionId === "no") {
      this.lastDenialPivot = this.promptProbe.denialPivot;
    }
    const pickedLabel = this.promptProbe.options.find((o) => o.id === optionId)?.label;
    if (pickedLabel) {
      this.pickedLabels.push(pickedLabel);
      this.pickedPairs.push({ label: pickedLabel, prompt: this.promptProbe.prompt });
      this.ackCue = this.performer.acknowledge(pickedLabel);
    }
    this.promptProbe = null;

    if (result.contradiction && !this.inRecovery) {
      // Resolve the flag now; the recovery probe is the response to the surprise.
      this.belief = resolveContradiction(this.belief);
      if (this.isGazedOrEquivocation || this.answered >= this.effectiveMaxProbes) {
        this.miss();
        return;
      }
      this.recoveryReason = "contradiction";
      this.enterRecovery();
      return;
    }

    // Blueprint §3: with validated gaze evidence isolating the pair or equivocation mode active,
    // one progressive statement may commit; the threshold relaxes to the effect's
    // gazed setting and a single explicit answer suffices.
    const gazed = this.gazedZones.length > 0 || this.gazeWindows >= 1;
    const equiv = this.equivocationActive || this.used.has("card-equivocation-gesture") || this.used.has("card-equivocation-secondary");
    const threshold = equiv
      ? 0.60
      : (gazed && this.effect.config.commitThresholdGazed !== undefined
        ? this.effect.config.commitThresholdGazed
        : this.effect.config.commitThreshold);
    if (commitGate(this.belief, threshold, this.answered, (gazed || equiv) ? 1 : 2)) {
      this.freezeAndBuild();
      return;
    }

    if (this.answered >= this.effectiveMaxProbes) {
      if (!this.isGazedOrEquivocation && !this.inRecovery && this.recoveryLeft > 0) {
        // CRIT-03: exhausting the question budget is a tie-break between two
        // remaining impressions, never an accusation of contradicting.
        this.recoveryReason = this.recoveryReason ?? "tie-break";
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
    return {
      phase: this.phase,
      line: this.line,
      cues: this.currentCues(),
      caption: this.line,
      prompt: this.phase === "probe" ? this.promptProbe?.prompt : undefined,
      probeId: this.phase === "probe" ? this.promptProbe?.id : undefined,
      options: this.phase === "probe" ? this.promptProbe?.options.map((o) => ({ ...o })) : undefined,
      beat: this.phase,
      turn: this.answered + this.recoveryCount * 100,
      sealedCommitment:
        this.sealed && ["probe", "recover", "build", "reveal", "afterglow"].includes(this.phase)
          ? this.sealed.commitment
          : undefined,
      sealedOpened:
        this.sealed && ["reveal", "afterglow", "miss"].includes(this.phase)
          ? {
              commitment: this.sealed.commitment,
              hypothesisId: this.sealed.hypothesisId,
              nonce: this.sealed.nonce,
              verified: this.sealedVerified === true
            }
          : undefined,
      revealGate:
        this.phase === "reveal" && this.effect.script().revealInvite
          ? {
              invite: sanitizeLine(this.effect.script().revealInvite!, "You turn it over."),
              action: this.effect.script().revealAction ?? "Turn it over"
            }
          : undefined,
      recoveryReason: this.phase === "recover" ? this.recoveryReason : null,
      reveal: this.revealCandidate && ["reveal", "afterglow"].includes(this.phase)
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
      revealedId: (this.pendingCandidate ?? this.revealCandidate)?.hypothesis.id,
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
      revealed: this.revealCandidate && ["reveal", "afterglow", "done"].includes(this.phase)
        ? { id: this.revealCandidate.hypothesis.id, confidence: this.revealCandidate.probability }
        : undefined,
      sealed:
        this.sealed && ["reveal", "afterglow", "done", "miss"].includes(this.phase)
          ? {
              commitment: this.sealed.commitment,
              hypothesisId: this.sealed.hypothesisId,
              nonce: this.sealed.nonce,
              verified: this.sealedVerified === true
            }
          : undefined,
      note: "Categorical evidence only. No camera frames, images, audio, or identity data."
    };
  }

  private currentCues(): Cue[] {
    const rest: Cue = { id: `line-${this.phase}-${this.answered}`, kind: "line", line: this.line, holdMs: 0 };
    if (this.phase === "probe") {
      const prompt: Cue = { ...rest, kind: "prompt" };
      return this.ackCue ? [this.ackCue, prompt] : [prompt];
    }
    if (this.phase === "build" || this.phase === "reveal" || this.phase === "miss") {
      if (this.phaseCues && this.phaseCues.length > 0) return this.phaseCues.map((c) => ({ ...c }));
    }
    return [rest];
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

  private statementPool(): Probe[] {
    // Hinted zone statements are served only by the gaze/equivocation branches above;
    // equivocation choreography likewise keeps its dedicated branches.
    return this.probes.filter(
      (p) => p.discourse === "statement" && !p.channelHint && !p.id.startsWith("card-equivocation") && !this.used.has(p.id)
    );
  }

  private questionPool(): Probe[] {
    return this.probes.filter(
      (p) => p.discourse !== "statement" && !p.channelHint && !p.id.startsWith("card-equivocation") && !this.used.has(p.id)
    );
  }

  private isGenuineTie(): boolean {
    if (this.statementPool().length !== 0) return false;
    const top = topHypotheses(this.belief, 2);
    if (top.length < 2) return false;
    if (top[0]!.probability < TIE_FLOOR || top[1]!.probability < TIE_FLOOR) return false;
    if (Math.abs(top[0]!.probability - top[1]!.probability) >= TIE_GAP) return false;
    const gazed = this.gazedZones.length > 0 || this.gazeWindows >= 1;
    const equiv = this.equivocationActive || this.used.has("card-equivocation-gesture");
    const threshold = equiv ? 0.60 : gazed && this.effect.config.commitThresholdGazed !== undefined ? this.effect.config.commitThresholdGazed : this.effect.config.commitThreshold;
    if (commitGate(this.belief, threshold, this.answered, gazed || equiv ? 1 : 2)) return false;
    return true;
  }

  private startProbing(): void {
    this.cameraActive = false;

    // 1. Equivocation fallback on Beat 1:
    // When gaze reliability was low (< 0.5) or camera was uncalibrated/failed,
    // issue the equivocation physical elimination gesture on Beat 1.
    const equivocationProbe = this.probes.find((p) => p.id === "card-equivocation-gesture");
    if (equivocationProbe && !this.used.has(equivocationProbe.id) && this.answered === 0) {
      const lowReliability = this.gazeReliabilities.length > 0 && Math.max(...this.gazeReliabilities) < 0.50;
      const cameraUncalibratedOrFailed = this.cameraRequested && (!this.cameraValidated || this.gazeWindows === 0);
      if (lowReliability || cameraUncalibratedOrFailed) {
        this.equivocationActive = true;
        this.phase = "probe";
        this.promptProbe = equivocationProbe;
        this.line = sanitizeLine(
          equivocationProbe.prompt,
          "Reach toward your screen. Cast half the cards into shadow."
        );
        return;
      }
    }

    // 2. Equivocation choreography on Beat 2+:
    // When in equivocation mode, NEVER fall through to generic CARD_PROBES!
    if (this.equivocationActive || this.used.has("card-equivocation-gesture")) {
      // If gaze zones are available, check for hinted zone statements
      if (this.gazedZones.length > 0) {
        for (let i = this.gazedZones.length - 1; i >= 0; i--) {
          const zone = this.gazedZones[i]!;
          const hinted = this.probes.find(
            (p) =>
              !this.used.has(p.id) &&
              p.channelHint?.channel === "gaze" &&
              p.channelHint.value === zone
          );
          if (hinted) {
            this.phase = "probe";
            this.promptProbe = hinted;
            this.line = sanitizeLine(hinted.prompt, "One more question. What feels true?");
            return;
          }
        }
      }

      // If camera uncalibrated or gaze absent/dropped: deliver secondary progressive reading probe for remaining red candidates
      const secondaryProbe = this.probes.find(
        (p) => !this.used.has(p.id) && p.id === "card-equivocation-secondary"
      );
      if (secondaryProbe) {
        this.phase = "probe";
        this.promptProbe = secondaryProbe;
        this.line = sanitizeLine(secondaryProbe.prompt, "Hold the crimson in mind.");
        return;
      }

      // If equivocation probes are exhausted, evaluate commitGate or miss strictly (NEVER fall through to generalProbes)
      const threshold = 0.60;
      if (commitGate(this.belief, threshold, this.answered, 1)) {
        this.freezeAndBuild();
      } else {
        this.miss();
      }
      return;
    }

    // 3. Blueprint §3: after gaze evidence the show leads with the crafted
    // statement for the most recently fixated zone - a progressive reading,
    // never a symmetric question.
    const hasZoneStatements = this.probes.some((p) => p.channelHint?.channel === "gaze");
    if (this.gazedZones.length > 0 && hasZoneStatements) {
      for (let i = this.gazedZones.length - 1; i >= 0; i--) {
        const zone = this.gazedZones[i]!;
        const hinted = this.probes.find(
          (p) =>
            !this.used.has(p.id) &&
            p.channelHint?.channel === "gaze" &&
            p.channelHint.value === zone
        );
        if (hinted) {
          this.phase = "probe";
          this.promptProbe = hinted;
          this.line = sanitizeLine(hinted.prompt, "One more question. What feels true?");
          return;
        }
      }
      // CRITICAL: If all hinted zone statements have been used, NEVER fall through to selectProbe
      // on generic CARD_PROBES! Instead evaluate commitGate, or miss.
      const threshold = this.effect.config.commitThresholdGazed ?? this.effect.config.commitThreshold;
      if (commitGate(this.belief, threshold, this.answered, 1)) {
        this.freezeAndBuild();
      } else {
        this.miss();
      }
      return;
    }

    // 4. Statement spine (default): first unused authored statement, in effect order.
    const statements = this.statementPool();
    if (statements.length > 0) {
      const probe = statements[0]!;
      this.phase = "probe";
      this.promptProbe = probe;
      this.line = sanitizeLine(probe.prompt, "One more impression. What feels true?");
      return;
    }

    // 5. Tie-break question only on a genuine posterior tie (pool exhausted).
    // Effects that author no statements at all keep their authored question path.
    const hasStatements = this.probes.some(
      (p) => p.discourse === "statement" && !p.channelHint && !p.id.startsWith("card-equivocation")
    );
    if (!hasStatements || this.isGenuineTie()) {
      const choice = selectProbe(
        this.belief,
        this.questionPool(),
        this.used,
        this.policy,
        this.config,
        this.effect.config.costWeight
      );
      if (choice) {
        this.phase = "probe";
        this.promptProbe = choice.probe;
        this.line = sanitizeLine(choice.probe.prompt, "One more impression. What feels true?");
        return;
      }
    }
    if (commitGate(this.belief, this.effect.config.commitThreshold, this.answered)) {
      this.freezeAndBuild();
    } else {
      this.miss();
    }
  }

  private enterRecovery(): void {
    if (this.isGazedOrEquivocation || this.recoveryLeft <= 0) {
      this.miss();
      return;
    }
    this.recoveryLeft -= 1;
    this.recoveryCount += 1;
    this.ackCue = null;
    this.phase = "recover";
    this.line = sanitizeLine(
      this.effect.script().recoverLine,
      "Two signals are fighting. Help me with one more step."
    );
  }

  private startRecoveryProbe(): void {
    if (this.isGazedOrEquivocation) {
      this.miss();
      return;
    }
    const statements = this.statementPool();
    if (statements.length > 0) {
      const probe = statements[0]!;
      this.inRecovery = true;
      this.phase = "probe";
      this.promptProbe = probe;
      this.line = sanitizeLine(`One clean claim. ${probe.prompt}`, "One clean claim. What feels true?");
      return;
    }
    const hasStatements = this.probes.some(
      (p) => p.discourse === "statement" && !p.channelHint && !p.id.startsWith("card-equivocation")
    );
    if (!hasStatements || this.isGenuineTie()) {
      const choice = selectProbe(this.belief, this.questionPool(), this.used, "greedy", this.config, 0);
      if (choice) {
        this.inRecovery = true;
        this.phase = "probe";
        this.promptProbe = choice.probe;
        this.line = sanitizeLine(
          `One clean claim. ${choice.probe.prompt}`,
          "One clean claim. What feels true?"
        );
        return;
      }
    }
    this.miss();
  }

  private freezeAndBuild(): void {
    const best = bestHypothesis(this.belief);
    this.pendingCandidate = { hypothesis: best.hypothesis, probability: best.probability };
    this.revealCandidate = null;
    this.phase = "build";
    const lines = this.effect.script().buildLines;
    const template = lines[this.answered % Math.max(1, lines.length)] ?? "It is becoming clear.";
    this.line = sanitizeLine(template.replace(/\{n\}/g, String(this.answered)), "It is becoming clear.");
    this.ackCue = null;
    const gazedOrEquiv = this.gazedZones.length > 0 || this.gazeWindows >= 1 || this.equivocationActive || this.used.has("card-equivocation-gesture");
    const recapCue: Cue = (gazedOrEquiv && this.lastDenialPivot)
      ? {
          id: "denial-pivot",
          kind: "line",
          line: sanitizeLine(this.lastDenialPivot, "The impression shifts into focus."),
          holdMs: 1800
        }
      : this.performer.recapAnswers(this.pickedPairs);
    const middle: Cue[] = [];
    const isDenialPivotRecap = recapCue.id === "denial-pivot";
    if (!isDenialPivotRecap) {
      const top = topHypotheses(this.belief, 2);
      const gap = top.length >= 2 ? Math.abs(top[0]!.probability - top[1]!.probability) : 1;
      if (this.lastDenialPivot !== null || gap < HESITATE_GAP) {
        middle.push(this.performer.hesitate());
      }
    }
    if (this.attuneDurationMs !== null) {
      const timeLines = this.effect.script().timeBeatLines;
      if (timeLines && timeLines.length > 0) {
        const bucket = this.attuneDurationMs < TIME_BRIEF_MAX_MS ? 0 : this.attuneDurationMs < TIME_SETTLED_MAX_MS ? 1 : 2;
        const raw = timeLines[bucket] ?? timeLines[0]!;
        middle.push({
          id: "time-beat",
          kind: "line",
          line: sanitizeLine(raw, "You held that image steady while the room settled."),
          holdMs: 1600
        });
      }
    }
    this.phaseCues = this.performer.buildSequence(recapCue, this.line, middle);
  }

  private doReveal(): void {
    const pending = this.pendingCandidate;
    if (!pending) {
      if (!this.revealCandidate) {
        this.miss();
        return;
      }
    } else {
      if (this.sealed) {
        const verified =
          verifySealedPrediction(this.sealed, pending.hypothesis.id, this.sealed.nonce) &&
          pending.hypothesis.id === this.sealed.hypothesisId;
        this.sealedVerified = verified;
        if (!verified) {
          // Force failed or seal tampered: honest miss, never swap the prediction.
          this.miss();
          return;
        }
      }
      this.revealCandidate = pending;
      this.pendingCandidate = null;
    }
    if (!this.revealCandidate) {
      this.miss();
      return;
    }
    if (this.sealed && this.sealedVerified === null) {
      const verified =
        verifySealedPrediction(this.sealed, this.revealCandidate.hypothesis.id, this.sealed.nonce) &&
        this.revealCandidate.hypothesis.id === this.sealed.hypothesisId;
      this.sealedVerified = verified;
      if (!verified) {
        this.miss();
        return;
      }
    }
    this.phase = "reveal";
    const line = this.effect
      .script()
      .revealLine(this.revealCandidate.hypothesis, this.revealCandidate.probability);
    this.line = sanitizeLine(line, `It was ${this.revealCandidate.hypothesis.label}.`);
    this.phaseCues = this.sealed
      ? this.performer.punchlineSequence(this.line)
      : this.performer.revealSequence(this.line);
  }

  private miss(): void {
    this.phase = "miss";
    this.revealCandidate = null;
    this.pendingCandidate = null;
    this.line = sanitizeLine(
      this.effect.script().missLine,
      "You beat me. The choice stayed yours."
    );
    this.ackCue = null;
    this.phaseCues = this.performer.missSequence(this.line);
  }
}

export function createSession(effect: Effect, options?: SessionOptions): PerformanceSession {
  return new PerformanceSession(effect, options);
}