import { useCallback, useEffect, useRef, useState } from "react";
import { isHostedVoiceAvailable, resolveHostedVoiceConfig } from "./hosted-voice-policy.js";
import type { HostedVoiceRelay } from "./hosted-voice-relay.js";
import type { SensorSession } from "./sensor-session.js";

export type HostedVoiceState = "inactive" | "disabled" | "connecting" | "live" | "closed" | "error";

export function useHostedVoice(opts: {
  hostedVoiceOptIn: boolean;
  session: SensorSession | null;
  onError?: (reason: string) => void;
}) {
  const [state, setState] = useState<HostedVoiceState>("inactive");
  const relayRef = useRef<HostedVoiceRelay | null>(null);
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;

  useEffect(() => {
    const config = resolveHostedVoiceConfig(import.meta.env as Record<string, string | undefined>);
    if (!isHostedVoiceAvailable(config, { hostedVoiceOptIn: opts.hostedVoiceOptIn })) {
      setState(config.enabled ? "inactive" : "disabled");
      return;
    }
    if (!opts.session) return;
    let cancelled = false;
    void (async () => {
      try {
        const mod = await import("./hosted-voice-relay.js");
        if (cancelled) return;
        const relay = mod.createHostedVoiceRelay(resolveHostedVoiceConfig(import.meta.env as Record<string, string | undefined>));
        relayRef.current = relay;
        const audioBuf = new Float32Array(1024);
        const transcripts: string[] = [];
        opts.session?.registerDerived("hosted-voice", () => relay.disconnect());
        opts.session?.registerDerived("hosted-voice-buffers", () => { audioBuf.fill(0); transcripts.length = 0; });
        setState("connecting");
        const stream = opts.session?.stream("mic") as unknown as MediaStream | null;
        if (!stream) throw new Error("microphone stream unavailable");
        await relay.connect(stream);
        if (!cancelled) setState("live");
      } catch (cause) {
        if (cancelled) return;
        setState("error");
        onErrorRef.current?.(cause instanceof Error ? cause.message : "hosted voice unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [opts.hostedVoiceOptIn, opts.session]);

  const forget = useCallback(() => {
    opts.session?.forget("hosted-voice");
    opts.session?.forget("hosted-voice-buffers");
    relayRef.current?.disconnect();
    relayRef.current = null;
    setState("closed");
  }, [opts.session]);

  return { state, relay: relayRef.current, forget };
}
