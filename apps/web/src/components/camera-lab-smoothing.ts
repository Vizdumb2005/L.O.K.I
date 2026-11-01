/**
 * Display stabilizers for the camera lab. Raw face/iris detection flickers
 * frame to frame; these helpers turn that stream into steady on-screen values.
 * Display only - they never alter what (does not) reach the show's engine.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Exponential moving average for a 2D signal that holds its last value through
 * short dropouts. Returns null only once the hold window expires, so a marker
 * stays put across a few lost frames instead of strobing.
 */
export class PointSmoother {
  private value: Point | null = null;
  private lastSeen = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly riseMs = 120,
    private readonly holdMs = 500
  ) {}

  update(sample: Point | null, now: number): Point | null {
    if (sample) {
      if (!this.value || now - this.lastSeen > this.holdMs * 4) {
        this.value = { ...sample };
      } else {
        const dt = Math.max(1, now - this.lastSeen);
        const alpha = 1 - Math.exp(-dt / this.riseMs);
        this.value = {
          x: this.value.x + (sample.x - this.value.x) * alpha,
          y: this.value.y + (sample.y - this.value.y) * alpha
        };
      }
      this.lastSeen = now;
      return this.value;
    }
    if (this.value && now - this.lastSeen <= this.holdMs) return this.value;
    return null;
  }

  reset(): void {
    this.value = null;
    this.lastSeen = Number.NEGATIVE_INFINITY;
  }
}

/**
 * Same EMA + hold treatment as PointSmoother, applied to a set of points
 * tracked by position in the array (e.g. face landmarks by index). Raw
 * landmarks jitter every detection and vanish on dropped frames; drawing
 * this smoothed set on every frame keeps the dots steady on the skin
 * instead of strobing at the detection rate. Missing entries stay missing.
 */
export class PointSetSmoother {
  private values: (Point | null)[] = [];
  private lastSeen = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly riseMs = 120,
    private readonly holdMs = 500
  ) {}

  update(samples: readonly (Point | null | undefined)[] | null, now: number): (Point | null)[] | null {
    if (samples) {
      const fresh = this.values.length === 0 || now - this.lastSeen > this.holdMs * 4;
      const dt = Math.max(1, now - this.lastSeen);
      const alpha = 1 - Math.exp(-dt / this.riseMs);
      this.values = samples.map((sample, index) => {
        if (!sample) return null;
        const previous = fresh ? null : this.values[index];
        if (!previous) return { ...sample };
        return {
          x: previous.x + (sample.x - previous.x) * alpha,
          y: previous.y + (sample.y - previous.y) * alpha
        };
      });
      this.lastSeen = now;
      return this.values;
    }
    if (this.values.length > 0 && now - this.lastSeen <= this.holdMs) return this.values;
    return null;
  }

  reset(): void {
    this.values = [];
    this.lastSeen = Number.NEGATIVE_INFINITY;
  }
}

/** Scalar exponential moving average (brightness and similar readouts). */
export class ScalarSmoother {
  private value: number | null = null;

  constructor(private readonly riseMs = 250) {}

  update(sample: number, now: number, previousNow: number): number {
    if (this.value === null) {
      this.value = sample;
    } else {
      const dt = Math.max(1, now - previousNow);
      const alpha = 1 - Math.exp(-dt / this.riseMs);
      this.value = this.value + (sample - this.value) * alpha;
    }
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/**
 * Hysteresis latch for a noisy boolean (e.g. "face detected"): turns on after
 * `onFrames` consecutive true samples and off after `offFrames` consecutive
 * false ones, so single-frame dropouts never flip the displayed state.
 */
export class StableLatch {
  private streak = 0;
  private state = false;

  constructor(
    private readonly onFrames: number,
    private readonly offFrames: number
  ) {}

  update(sample: boolean): boolean {
    this.streak = sample
      ? this.streak > 0
        ? this.streak + 1
        : 1
      : this.streak < 0
        ? this.streak - 1
        : -1;
    if (!this.state && this.streak >= this.onFrames) this.state = true;
    else if (this.state && this.streak <= -this.offFrames) this.state = false;
    return this.state;
  }

  get current(): boolean {
    return this.state;
  }

  reset(): void {
    this.state = false;
    this.streak = 0;
  }
}

/**
 * Direction text ("left / up" and friends) with per-axis hysteresis: an axis
 * only flips when the signal crosses zero by more than `margin`, so jitter
 * around the centre does not rewrite the label every frame.
 */
export class DirectionLabel {
  private signX = 1;
  private signY = 1;
  private started = false;

  constructor(private readonly margin = 0.06) {}

  update(point: Point): string {
    if (!this.started) {
      this.signX = point.x >= 0 ? 1 : -1;
      this.signY = point.y >= 0 ? 1 : -1;
      this.started = true;
    } else {
      if (this.signX > 0 && point.x < -this.margin) this.signX = -1;
      else if (this.signX < 0 && point.x > this.margin) this.signX = 1;
      if (this.signY > 0 && point.y < -this.margin) this.signY = -1;
      else if (this.signY < 0 && point.y > this.margin) this.signY = 1;
    }
    return `${this.signX > 0 ? "right" : "left"} / ${this.signY > 0 ? "down" : "up"}`;
  }

  reset(): void {
    this.started = false;
  }
}
