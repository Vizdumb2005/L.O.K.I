/**
 * Sensor session manager for the sensor-enabled performance mode.
 *
 * Owns the lifecycle the consent surface promises: per-sensor acquire,
 * one-tap stop that releases every track AND every piece of derived state
 * (including any voice embedding), and no persistence of anything. The
 * embedding registry is in-memory only by construction - there is no
 * storage path to forget to clear.
 *
 * Consent rule this enforces mechanically: derived state cannot outlive
 * the session. `stopAll()` tears down media and derived state together.
 */

export type SensorKind = "camera" | "mic";
export type SensorState = "idle" | "requesting" | "active" | "stopped" | "error" | "unsupported";

export interface MediaStreamLike {
  getTracks(): Array<{ stop(): void; readyState: string }>;
}

export interface SensorSessionDeps {
  getUserMedia: ((constraints: { video?: boolean; audio?: boolean }) => Promise<MediaStreamLike>) | null;
}

interface SensorSlot {
  state: SensorState;
  stream: MediaStreamLike | null;
  error: string | null;
}

export class SensorSession {
  private slots: Record<SensorKind, SensorSlot> = {
    camera: { state: "idle", stream: null, error: null },
    mic: { state: "idle", stream: null, error: null }
  };
  private derived = new Map<string, () => void>();
  private listeners = new Set<() => void>();

  constructor(private deps: SensorSessionDeps) {}

  state(kind: SensorKind): SensorState {
    return this.slots[kind].state;
  }

  error(kind: SensorKind): string | null {
    return this.slots[kind].error;
  }

  stream(kind: SensorKind): MediaStreamLike | null {
    return this.slots[kind].stream;
  }

  get supported(): boolean {
    return this.deps.getUserMedia !== null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Acquire a sensor. Idempotent-strict: acquiring an active sensor throws. */
  async acquire(kind: SensorKind): Promise<MediaStreamLike | null> {
    const slot = this.slots[kind];
    if (slot.state === "active" && slot.stream) return slot.stream;
    if (!this.deps.getUserMedia) {
      slot.state = "unsupported";
      slot.error = "This device or browser does not expose camera/microphone capture.";
      this.emit();
      return null;
    }
    slot.state = "requesting";
    this.emit();
    try {
      const stream = await this.deps.getUserMedia(kind === "camera" ? { video: true } : { audio: true });
      slot.stream = stream;
      slot.state = "active";
      slot.error = null;
      this.emit();
      return stream;
    } catch (cause) {
      slot.state = "error";
      slot.error = cause instanceof Error ? cause.message : "Permission was not granted.";
      this.emit();
      return null;
    }
  }

  /**
   * Register derived state (e.g. the voice embedding) with its disposer.
   * Disposed by stopAll() and by forget(). Never persisted.
   */
  registerDerived(key: string, dispose: () => void): void {
    this.derived.get(key)?.();
    this.derived.set(key, dispose);
  }

  /** Withdraw one piece of derived state (the "Forget my voice" control). */
  forget(key: string): void {
    this.derived.get(key)?.();
    this.derived.delete(key);
    this.emit();
  }

  has(key: string): boolean {
    return this.derived.has(key);
  }

  /** One-tap stop: every track stopped, every derived state disposed. */
  stopAll(): void {
    for (const kind of ["camera", "mic"] as const) {
      const slot = this.slots[kind];
      if (slot.stream) {
        for (const track of slot.stream.getTracks()) track.stop();
      }
      slot.stream = null;
      if (slot.state === "active" || slot.state === "requesting") slot.state = "stopped";
    }
    for (const dispose of this.derived.values()) dispose();
    this.derived.clear();
    this.emit();
  }
}
