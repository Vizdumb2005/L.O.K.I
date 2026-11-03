export const HOSTED_VOICE = {
  TURN_BUDGET_MS: 600,
  BUDGET: { ingressMs: 50, asrMs: 200, llmMs: 250, ttsMs: 100 } as const,
  MAX_SESSION_MS: 4 * 60 * 1000,
  IDLE_TIMEOUT_MS: 30_000,
  MAX_RECONNECTS: 0,
} as const;

export interface ZdrAttestation {
  mipOptOut: true;
  noTraining: true;
  noRetention: true;
  persistAudio: false;
  persistTranscript: false;
}

export type HostedVoiceProvider = "deepgram-cartesia" | "gemini-live";

export interface HostedVoiceConfig {
  enabled: boolean;
  relayUrl: string | null;
  provider: HostedVoiceProvider | null;
  zdr: ZdrAttestation;
}

const ZDR: ZdrAttestation = Object.freeze({
  mipOptOut: true,
  noTraining: true,
  noRetention: true,
  persistAudio: false,
  persistTranscript: false,
});

const PROVIDERS: ReadonlySet<string> = new Set(["deepgram-cartesia", "gemini-live"]);

export function resolveHostedVoiceConfig(env: {
  VITE_HOSTED_VOICE_RELAY_URL?: string;
  VITE_HOSTED_VOICE_PROVIDER?: string;
}): HostedVoiceConfig {
  const url = env.VITE_HOSTED_VOICE_RELAY_URL?.trim() ?? "";
  const provider = env.VITE_HOSTED_VOICE_PROVIDER?.trim() ?? "";
  const valid = url.startsWith("wss://") && PROVIDERS.has(provider);
  const config: HostedVoiceConfig = {
    enabled: valid,
    relayUrl: valid ? url : null,
    provider: valid ? (provider as HostedVoiceProvider) : null,
    zdr: ZDR,
  };
  return Object.freeze(config);
}

export function assertZdrHeaders(config: HostedVoiceConfig): Record<string, string> {
  const z = config.zdr;
  if (z.mipOptOut !== true || z.noTraining !== true || z.noRetention !== true || z.persistAudio !== false || z.persistTranscript !== false) {
    throw new Error("ZDR attestation has been altered; refusing hosted voice");
  }
  return {
    "X-ZDR-Mip-Opt-Out": "true",
    "X-ZDR-No-Training": "true",
    "X-ZDR-No-Retention": "true",
  };
}

export function isHostedVoiceAvailable(
  config: HostedVoiceConfig,
  consent: { hostedVoiceOptIn: boolean },
): boolean {
  return config.enabled && consent.hostedVoiceOptIn === true;
}
