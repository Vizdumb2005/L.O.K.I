import { sanitizeLine } from "./patter.js";

/**
 * Domain-neutral performer layer. It turns session moments into short timed cues so the
 * show reads as a performed encounter instead of a questionnaire. It knows nothing about
 * any particular effect. It only echoes what the person chose, and it never names a
 * hypothesis: the reveal line itself still comes from the effect.
 */
export type CueKind = "ack" | "prompt" | "recap" | "build" | "hush" | "reveal" | "concede" | "miss" | "line";

export interface Cue {
  id: string;
  kind: CueKind;
  line: string;
  /** How long the cue stays before the next one, in ms. 0 means it rests until the person acts. */
  holdMs: number;
}

const ACK_TEMPLATES: readonly string[] = [
  "{label}. I will hold on to that.",
  "Mm. {label}.",
  "{label}. Thank you.",
  "{label}. That is useful.",
  "Good. {label}."
];

const HUSH_LINES: readonly string[] = ["Let it be quiet for a moment.", "I am going to say it now."];
const CONCEDE_LINE = "I cannot hold it clearly enough to say.";
const RECAP_EMPTY = "I have what you have given me so far.";

export const ACK_HOLD_MS = 1100;
export const RECAP_HOLD_MS = 2200;
export const BUILD_HOLD_MS = 1600;
export const HUSH_HOLD_MS = [1700, 1400] as const;
export const CONCEDE_HOLD_MS = 1600;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function joinLabels(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export class Performer {
  private readonly random: () => number;
  private lastAck = -1;
  private counter = 0;

  constructor(seed: number) {
    this.random = rng(seed ^ 0x9e3779b1);
  }

  private nextId(kind: CueKind): string {
    this.counter += 1;
    return `${kind}-${this.counter}`;
  }

  /** Echo of the person's own chosen option label. Never repeats the previous template. */
  acknowledge(label: string): Cue {
    const safeLabel = label.replace(/[{}]/g, "").trim();
    let index = Math.floor(this.random() * ACK_TEMPLATES.length);
    if (index === this.lastAck) index = (index + 1) % ACK_TEMPLATES.length;
    this.lastAck = index;
    const template = ACK_TEMPLATES[index]!;
    const fallback = `${safeLabel || "Noted"}.`;
    return {
      id: this.nextId("ack"),
      kind: "ack",
      line: sanitizeLine(template.replace("{label}", safeLabel), fallback),
      holdMs: ACK_HOLD_MS
    };
  }

  /** Thought echo built only from the person's own answers, in the order given. */
  recap(labels: string[]): Cue {
    const clean = labels.map((l) => l.replace(/[{}]/g, "").trim()).filter(Boolean);
    const line =
      clean.length === 0 ? RECAP_EMPTY : `You told me ${joinLabels(clean)}. I have kept all of it.`;
    return {
      id: this.nextId("recap"),
      kind: "recap",
      line: sanitizeLine(line, RECAP_EMPTY),
      holdMs: RECAP_HOLD_MS
    };
  }

  /** Reveal: two quiet beats, then the effect's own reveal line, which rests. */
  revealSequence(revealLine: string): Cue[] {
    return [
      { id: this.nextId("hush"), kind: "hush", line: HUSH_LINES[0]!, holdMs: HUSH_HOLD_MS[0] },
      { id: this.nextId("hush"), kind: "hush", line: HUSH_LINES[1]!, holdMs: HUSH_HOLD_MS[1] },
      { id: this.nextId("reveal"), kind: "reveal", line: revealLine, holdMs: 0 }
    ];
  }

  /** Honest miss: say plainly that it did not land, then the effect's own miss line. */
  missSequence(missLine: string): Cue[] {
    return [
      { id: this.nextId("concede"), kind: "concede", line: CONCEDE_LINE, holdMs: CONCEDE_HOLD_MS },
      { id: this.nextId("miss"), kind: "miss", line: missLine, holdMs: 0 }
    ];
  }

  buildSequence(recap: Cue, buildLine: string): Cue[] {
    return [recap, { id: this.nextId("build"), kind: "build", line: buildLine, holdMs: 0 }];
  }
}
