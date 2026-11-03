import { describe, expect, it, vi } from "vitest";
import { resolveHostedVoiceConfig } from "./hosted-voice-policy.js";
import { createHostedVoiceRelay, HostedVoiceUnavailableError, WebRtcHostedVoiceRelay } from "./hosted-voice-relay.js";

function fakeStream(video = false): MediaStream {
  return {
    getVideoTracks: () => (video ? [{} as MediaStreamTrack] : []),
    getAudioTracks: () => [{} as MediaStreamTrack],
  } as unknown as MediaStream;
}
const enabled = () => resolveHostedVoiceConfig({ VITE_HOSTED_VOICE_RELAY_URL: "wss://r.example", VITE_HOSTED_VOICE_PROVIDER: "gemini-live" });
const disabled = () => resolveHostedVoiceConfig({});

describe("hosted-voice-relay", () => {
  it("DisabledRelay rejects and stays disabled", async () => {
    const r = createHostedVoiceRelay(disabled());
    expect(r.state).toBe("disabled");
    await expect(r.connect(fakeStream())).rejects.toBeInstanceOf(HostedVoiceUnavailableError);
    expect(r.state).toBe("disabled");
  });

  it("refuses video tracks (camera never leaves device)", async () => {
    const r = new WebRtcHostedVoiceRelay(enabled(), () => ({ addTrack: vi.fn(), createDataChannel: vi.fn(), close: vi.fn() }));
    await expect(r.connect(fakeStream(true))).rejects.toThrow(/audio only/);
  });

  it("disconnect is idempotent, zeroes buffers, no resurrection of old peer", async () => {
    const close = vi.fn();
    let factoryCalls = 0;
    const factory = () => { factoryCalls += 1; return { addTrack: vi.fn(), createDataChannel: vi.fn(() => ({})), close }; };
    const r = new WebRtcHostedVoiceRelay(enabled(), factory);
    await r.connect(fakeStream());
    r.audioBuffer[0] = 0.5; r.transcriptBuffer.push("hi");
    r.disconnect(); r.disconnect();
    expect(close).toHaveBeenCalledTimes(1);
    expect(r.audioBuffer[0]).toBe(0);
    expect(r.transcriptBuffer).toHaveLength(0);
    expect(r.state).toBe("closed");
    await r.connect(fakeStream());
    expect(factoryCalls).toBe(2);
    expect(r.state).toBe("live");
  });

  it("budget exceeded fires exactly once per utterance", async () => {
    let now = 1000;
    const r = new WebRtcHostedVoiceRelay(enabled(), () => ({ addTrack: vi.fn(), createDataChannel: vi.fn(() => ({})), close: vi.fn() }), () => now);
    await r.connect(fakeStream());
    const cb = vi.fn(); r.onBudgetExceeded = cb;
    r.markUtteranceEnd(); now = 1700; r.notifyFirstAudioFrame(0.1); r.notifyFirstAudioFrame(0.1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(700);
  });

  it("forget via SensorSession disposes hosted entries only", async () => {
    const { SensorSession } = await import("./sensor-session.js");
    const s = new SensorSession({ getUserMedia: null });
    const hosted = vi.fn(); const other = vi.fn();
    s.registerDerived("hosted-voice", hosted); s.registerDerived("other", other);
    s.forget("hosted-voice");
    expect(hosted).toHaveBeenCalledTimes(1); expect(other).not.toHaveBeenCalled();
    s.stopAll(); expect(other).toHaveBeenCalledTimes(1);
  });
});
