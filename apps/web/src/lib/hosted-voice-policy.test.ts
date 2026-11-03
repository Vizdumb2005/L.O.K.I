import { describe, expect, it } from "vitest";
import {
  HOSTED_VOICE,
  assertZdrHeaders,
  isHostedVoiceAvailable,
  resolveHostedVoiceConfig,
} from "./hosted-voice-policy.js";

describe("hosted-voice-policy", () => {
  it("fails closed when unconfigured, blank, or non-wss", () => {
    for (const env of [{}, { VITE_HOSTED_VOICE_RELAY_URL: "", VITE_HOSTED_VOICE_PROVIDER: "gemini-live" }, { VITE_HOSTED_VOICE_RELAY_URL: "https://x", VITE_HOSTED_VOICE_PROVIDER: "gemini-live" }, { VITE_HOSTED_VOICE_RELAY_URL: "wss://relay.example", VITE_HOSTED_VOICE_PROVIDER: "unknown" }]) {
      const c = resolveHostedVoiceConfig(env);
      expect(c.enabled).toBe(false);
      expect(c.relayUrl).toBeNull();
      expect(isHostedVoiceAvailable(c, { hostedVoiceOptIn: true })).toBe(false);
    }
  });

  it("enables only with valid wss + known provider and consent", () => {
    const c = resolveHostedVoiceConfig({ VITE_HOSTED_VOICE_RELAY_URL: "wss://relay.example/v1", VITE_HOSTED_VOICE_PROVIDER: "deepgram-cartesia" });
    expect(c.enabled).toBe(true);
    expect(c.zdr).toEqual({ mipOptOut: true, noTraining: true, noRetention: true, persistAudio: false, persistTranscript: false });
    expect(Object.isFrozen(c)).toBe(true);
    expect(isHostedVoiceAvailable(c, { hostedVoiceOptIn: false })).toBe(false);
    expect(isHostedVoiceAvailable(c, { hostedVoiceOptIn: true })).toBe(true);
  });

  it("assertZdrHeaders emits all headers and refuses mutated attestation", () => {
    const c = resolveHostedVoiceConfig({ VITE_HOSTED_VOICE_RELAY_URL: "wss://r.example", VITE_HOSTED_VOICE_PROVIDER: "gemini-live" });
    expect(assertZdrHeaders(c)).toEqual({ "X-ZDR-Mip-Opt-Out": "true", "X-ZDR-No-Training": "true", "X-ZDR-No-Retention": "true" });
    const mutated = { ...c, zdr: { ...c.zdr, persistAudio: true as unknown as false } };
    expect(() => assertZdrHeaders(mutated)).toThrow(/ZDR/);
  });

  it("budget sums to 600 and no reconnects", () => {
    const b = HOSTED_VOICE.BUDGET;
    expect(b.ingressMs + b.asrMs + b.llmMs + b.ttsMs).toBeLessThanOrEqual(600);
    expect(HOSTED_VOICE.TURN_BUDGET_MS).toBe(600);
    expect(HOSTED_VOICE.MAX_RECONNECTS).toBe(0);
  });
});
