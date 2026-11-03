import {
  HOSTED_VOICE,
  assertZdrHeaders,
  type HostedVoiceConfig,
} from "./hosted-voice-policy.js";

export class HostedVoiceUnavailableError extends Error {
  constructor(message = "hosted voice is not configured") {
    super(message);
    this.name = "HostedVoiceUnavailableError";
  }
}

export type RelayState = "disabled" | "connecting" | "live" | "closed" | "error";

export interface HostedVoiceRelay {
  readonly state: RelayState;
  connect(audioStream: MediaStream): Promise<void>;
  sendDirective(d: { beat: string; allowedClaims: string[] }): void;
  onTranscript: ((text: string, isFinal: boolean) => void) | null;
  onAudioFrame: ((rms: number) => void) | null;
  onBudgetExceeded: ((turnMs: number) => void) | null;
  disconnect(): void;
}

interface PeerLike {
  addTrack(track: MediaStreamTrack, stream: MediaStream): void;
  createDataChannel(label: string): unknown;
  close(): void;
}

export type PeerFactory = (config: HostedVoiceConfig, headers: Record<string, string>) => PeerLike;

class DisabledRelay implements HostedVoiceRelay {
  readonly state: RelayState = "disabled";
  onTranscript: HostedVoiceRelay["onTranscript"] = null;
  onAudioFrame: HostedVoiceRelay["onAudioFrame"] = null;
  onBudgetExceeded: HostedVoiceRelay["onBudgetExceeded"] = null;
  async connect(): Promise<void> {
    throw new HostedVoiceUnavailableError("hosted voice is not configured");
  }
  sendDirective(): void { /* disabled: no-op */ }
  disconnect(): void { /* idempotent no-op */ }
}

export class WebRtcHostedVoiceRelay implements HostedVoiceRelay {
  state: RelayState = "closed";
  onTranscript: HostedVoiceRelay["onTranscript"] = null;
  onAudioFrame: HostedVoiceRelay["onAudioFrame"] = null;
  onBudgetExceeded: HostedVoiceRelay["onBudgetExceeded"] = null;
  readonly audioBuffer = new Float32Array(4096);
  readonly transcriptBuffer: string[] = [];
  private peer: PeerLike | null = null;
  private utteranceEndAt: number | null = null;
  private budgetFired = false;
  private now: () => number;

  constructor(
    private config: HostedVoiceConfig,
    private peerFactory?: PeerFactory,
    now: () => number = () => performance.now(),
  ) { this.now = now; }

  async connect(audioStream: MediaStream): Promise<void> {
    if (audioStream.getVideoTracks().length > 0) {
      throw new Error("hosted voice accepts audio only; video tracks are refused");
    }
    if (this.state === "live" || this.state === "connecting") {
      throw new Error("hosted voice relay is already connected");
    }
    const headers = assertZdrHeaders(this.config);
    this.state = "connecting";
    try {
      const factory = this.peerFactory ?? ((cfg: HostedVoiceConfig, _h: Record<string, string>) => {
        if (typeof RTCPeerConnection === "undefined") {
          throw new HostedVoiceUnavailableError("WebRTC is not available in this browser");
        }
        const pc = new RTCPeerConnection();
        void cfg; void _h;
        return pc as unknown as PeerLike;
      });
      this.peer = factory(this.config, headers);
      for (const track of audioStream.getAudioTracks()) this.peer.addTrack(track, audioStream);
      this.peer.createDataChannel("loki-directives");
      this.state = "live";
    } catch (cause) {
      this.state = "error";
      this.peer = null;
      throw cause;
    }
  }

  sendDirective(d: { beat: string; allowedClaims: string[] }): void {
    void d;
    if (this.state !== "live") return;
  }

  markUtteranceEnd(): void {
    this.utteranceEndAt = this.now();
    this.budgetFired = false;
  }

  notifyFirstAudioFrame(rms: number): void {
    this.onAudioFrame?.(rms);
    if (this.utteranceEndAt === null || this.budgetFired) return;
    const turnMs = this.now() - this.utteranceEndAt;
    if (turnMs > HOSTED_VOICE.TURN_BUDGET_MS) {
      this.budgetFired = true;
      this.onBudgetExceeded?.(turnMs);
    }
  }

  disconnect(): void {
    try { this.peer?.close(); } catch { /* idempotent */ }
    this.peer = null;
    this.audioBuffer.fill(0);
    this.transcriptBuffer.length = 0;
    this.utteranceEndAt = null;
    if (this.state !== "disabled") this.state = "closed";
  }
}

export function createHostedVoiceRelay(
  config: HostedVoiceConfig,
  peerFactory?: PeerFactory,
  now?: () => number,
): HostedVoiceRelay {
  if (!config.enabled) return new DisabledRelay();
  return new WebRtcHostedVoiceRelay(config, peerFactory, now);
}
