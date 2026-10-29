/**
 * Short-clip microphone capture for enrollment and voice answers.
 *
 * Bounded by design: records only while explicitly called, from the
 * session's already-consented stream, decodes in-tab, returns raw 16 kHz
 * mono PCM, and keeps nothing. The caller owns the (in-memory) result.
 */

/** Resample to 16 kHz mono (linear; adequate for the gate/ASR models). */
export function to16kMono(pcm: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return pcm;
  const ratio = fromRate / 16000;
  const out = new Float32Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, pcm.length - 1);
    out[i] = pcm[lo]! + (pcm[hi]! - pcm[lo]!) * (pos - lo);
  }
  return out;
}

/**
 * Record up to `maxSeconds` from the stream, stopping early when
 * `shouldStop` returns true (called ~10x/s with the elapsed seconds).
 * Returns 16 kHz mono PCM. Never persists anything.
 */
export async function recordClip(
  stream: MediaStream,
  maxSeconds: number,
  shouldStop?: (elapsedSeconds: number) => boolean
): Promise<Float32Array> {
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
  );
  if (!mime) throw new Error("This browser cannot record short audio clips.");
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      if (elapsed >= maxSeconds || shouldStop?.(elapsed)) {
        window.clearInterval(timer);
        resolve();
      }
    }, 100);
  });
  rec.stop();
  await stopped;
  const blob = new Blob(chunks, { type: mime });
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const mono = buf.getChannelData(0);
  return to16kMono(mono, buf.sampleRate);
}
