/**
 * Energy-based sound-activity detector for the camera lab's microphone check.
 *
 * This is deliberately NOT speech recognition and NOT speaker separation: it tracks
 * the room's noise floor and reports when the incoming level rises clearly above it.
 * Any loud sound (music, clatter, a voice, several voices) trips it identically.
 */

export interface VadConfig {
  /** dB above the noise floor that counts as activity. */
  marginDb: number;
  /** Time constant (ms) for the floor to rise toward a louder room. */
  floorRiseMs: number;
  /** Time constant (ms) for the floor to fall toward a quieter room. */
  floorFallMs: number;
  /** Activity must stop for this long (ms) before the detector reports quiet again. */
  hangoverMs: number;
  /** Floor never starts above this (dBFS), so a loud room does not mask everything. */
  initialFloorDb: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  marginDb: 12,
  floorRiseMs: 4000,
  floorFallMs: 600,
  hangoverMs: 450,
  initialFloorDb: -60
};

export interface VadState {
  levelDb: number;
  floorDb: number;
  active: boolean;
}

/** Convert an RMS amplitude (0..1) to dBFS, floored to avoid -Infinity. */
export function rmsToDb(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1e-6));
}

export class MicVad {
  private readonly config: VadConfig;
  private floorDb: number;
  private active = false;
  private lastAboveAt: number | null = null;
  private lastAt: number | null = null;

  constructor(config: Partial<VadConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
    this.floorDb = this.config.initialFloorDb;
  }

  reset(): void {
    this.floorDb = this.config.initialFloorDb;
    this.active = false;
    this.lastAboveAt = null;
    this.lastAt = null;
  }

  update(levelDb: number, at: number): VadState {
    const dt = this.lastAt === null ? 0 : Math.max(0, at - this.lastAt);
    this.lastAt = at;

    const above = levelDb > this.floorDb + this.config.marginDb;

    // The floor only adapts while the room reads as quiet, so it does not chase
    // the very sound it is trying to notice.
    if (!this.active && dt > 0) {
      if (levelDb > this.floorDb) {
        const k = 1 - Math.exp(-dt / this.config.floorRiseMs);
        this.floorDb += (levelDb - this.floorDb) * k;
      } else {
        const k = 1 - Math.exp(-dt / this.config.floorFallMs);
        this.floorDb += (levelDb - this.floorDb) * k;
      }
    }

    if (above) {
      this.lastAboveAt = at;
      this.active = true;
    } else if (this.active && this.lastAboveAt !== null && at - this.lastAboveAt >= this.config.hangoverMs) {
      this.active = false;
      this.lastAboveAt = null;
    }

    return { levelDb, floorDb: this.floorDb, active: this.active };
  }
}
