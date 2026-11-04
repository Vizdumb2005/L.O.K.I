/**
 * The Countdown Force - a sealed-prediction effect whose outcome is
 * constrained by ARITHMETIC, not by evidence or reinterpretation.
 *
 * Method (fully transparent in the trace):
 *   1. Before anything, the performer seals one card (commitment hash).
 *      The deck is arranged with that card at forced position FORCED_POSITION
 *      counting from the top of the ORIGINAL deck.
 *   2. The spectator names any number in [MIN_NUMBER, MAX_NUMBER]. Every
 *      number in range is honored exactly as named; out-of-range input is
 *      rejected, never reinterpreted.
 *   3. The deal: N cards are dealt face-down into a pile (reversing their
 *      order), then the spectator counts digitSum(N) cards from the top of
 *      the DEALT pile; the last card counted is the selection. For every N
 *      in 10..19, N - digitSum(N) === 9, so the selection is always the card
 *      that started at position N - digitSum(N) + 1 === FORCED_POSITION in
 *      the original deck: the sealed card.
 *   4. The seal is opened and verified against the card the procedure
 *      actually produced. If the produced card is not the sealed card
 *      (setup broken, interrupted deal), the seal is STILL opened and the
 *      mismatch is an owned miss - never swapped, never hidden.
 *
 * Honesty contract: the effect never claims the spectator's number was
 * influenced or that any free thought was recovered. The theatrical claim
 * is limited to "I sealed a prediction before you named a number; here is
 * what your procedure produced" - true, because the procedure constrains
 * the outcome. Every spectator action is recorded verbatim in the trace.
 */

import { sealPrediction, verifySealedPrediction, type SealedPrediction } from "@loki/effect-api";

export const MIN_NUMBER = 10;
export const MAX_NUMBER = 19;
export const FORCED_POSITION = 10;

export type CountdownPhase = "sealed" | "awaiting-number" | "dealt" | "revealed" | "miss";

export interface CountdownTrace {
  /** The spectator's number, exactly as named. */
  readonly namedNumber: number | null;
  /** Cards dealt into the pile, in deal order (first dealt first). */
  readonly dealOrder: readonly string[];
  /** The count applied into the dealt pile: N - digitSum(N). */
  readonly countedSteps: number | null;
  /** The card the procedure produced. */
  readonly producedCardId: string | null;
  /** The sealed target id. */
  readonly sealedTargetId: string;
  /** Seal verification outcome at open time. */
  readonly sealVerified: boolean | null;
  readonly phase: CountdownPhase;
}

export function digitSum(n: number): number {
  return String(n).split("").reduce((s, d) => s + Number(d), 0);
}

/** The count applied into the dealt pile for a named number. */
export function countedStepsFor(n: number): number {
  return digitSum(n);
}

function randomNonce(): string {
  // crypto.getRandomValues is available in browsers and Node >= 19 - no node:crypto
  // import, which Vite externalizes and breaks client bundles.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class CountdownForce {
  readonly sealed: SealedPrediction;
  private readonly deck: readonly string[];
  private named: number | null = null;
  private produced: string | null = null;
  private dealOrder: readonly string[] = [];
  private sealVerified: boolean | null = null;
  private phaseValue: CountdownPhase = "sealed";

  /**
   * @param deckTopFirst the full arrangement, top of the original deck first.
   *        INVARIANT: deckTopFirst[FORCED_POSITION - 1] must be targetId;
   *        the constructor throws otherwise (a mis-set deck must never perform).
   */
  constructor(deckTopFirst: readonly string[], readonly targetId: string, nonce?: string) {
    if (deckTopFirst.length < MAX_NUMBER) {
      throw new Error(`deck must hold at least ${MAX_NUMBER} cards`);
    }
    if (deckTopFirst[FORCED_POSITION - 1] !== targetId) {
      throw new Error(`forced arrangement broken: position ${FORCED_POSITION} is not the target`);
    }
    this.deck = deckTopFirst;
    this.sealed = sealPrediction(targetId, nonce ?? randomNonce(), Date.now());
    this.phaseValue = "awaiting-number";
  }

  /** Record the spectator's named number. Out-of-range is rejected verbatim. */
  nameNumber(n: number): void {
    if (this.phaseValue !== "awaiting-number") throw new Error(`cannot name a number in phase ${this.phaseValue}`);
    if (!Number.isInteger(n) || n < MIN_NUMBER || n > MAX_NUMBER) {
      throw new Error(`number must be an integer in [${MIN_NUMBER}, ${MAX_NUMBER}] - named value rejected, not reinterpreted`);
    }
    this.named = n;
  }

  /** Perform the deal exactly as announced. */
  deal(): void {
    if (this.named === null) throw new Error("no number named");
    const n = this.named;
    // Deal n cards from the top of the original deck into the pile.
    this.dealOrder = this.deck.slice(0, n);
    // Count digitSum(n) cards from the top of the DEALT pile (last dealt = top);
    // the last card counted is the selection: dealOrder[n - digitSum(n)].
    const steps = countedStepsFor(n);
    this.produced = this.dealOrder[n - steps] ?? null;
    this.phaseValue = "dealt";
  }

  /**
   * Open the seal against the card the procedure produced. The seal is opened
   * and recorded even on mismatch: an owned miss, never a swap.
   */
  openSeal(): { produced: string; verified: boolean } {
    if (this.phaseValue !== "dealt" || this.produced === null) throw new Error("deal first");
    const verified =
      verifySealedPrediction(this.sealed, this.produced, this.sealed.nonce) &&
      this.produced === this.sealed.hypothesisId;
    this.sealVerified = verified;
    this.phaseValue = verified ? "revealed" : "miss";
    return { produced: this.produced, verified };
  }

  trace(): CountdownTrace {
    return {
      namedNumber: this.named,
      dealOrder: this.dealOrder,
      countedSteps: this.named === null ? null : countedStepsFor(this.named),
      producedCardId: this.produced,
      sealedTargetId: this.sealed.hypothesisId,
      sealVerified: this.sealVerified,
      phase: this.phaseValue
    };
  }
}
