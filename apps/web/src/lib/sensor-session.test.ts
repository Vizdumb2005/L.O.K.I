import { describe, expect, it, vi } from "vitest";
import { SensorSession, type MediaStreamLike } from "./sensor-session.js";

function fakeStream(): MediaStreamLike & { tracks: Array<{ stop: () => void; readyState: string }> } {
  const tracks = [0, 1].map(() => ({ stop: vi.fn(() => { tracks.forEach(() => {}); }), readyState: "live" }));
  return { tracks, getTracks: () => tracks };
}

describe("SensorSession", () => {
  it("acquires and reports active state", async () => {
    const s = new SensorSession({ getUserMedia: async () => fakeStream() });
    expect(await s.acquire("camera")).not.toBeNull();
    expect(s.state("camera")).toBe("active");
  });

  it("stopAll stops every track and disposes every derived state", async () => {
    const stream = fakeStream();
    const s = new SensorSession({ getUserMedia: async () => stream });
    await s.acquire("camera");
    await s.acquire("mic");
    const disposeVoice = vi.fn();
    s.registerDerived("voice-embedding", disposeVoice);
    s.stopAll();
    for (const t of stream.tracks) expect(t.stop).toHaveBeenCalled();
    expect(disposeVoice).toHaveBeenCalledTimes(1);
    expect(s.has("voice-embedding")).toBe(false);
    expect(s.state("camera")).toBe("stopped");
    expect(s.stream("camera")).toBeNull();
  });

  it("forget withdraws only the named derived state", () => {
    const s = new SensorSession({ getUserMedia: null });
    const a = vi.fn();
    const b = vi.fn();
    s.registerDerived("voice-embedding", a);
    s.registerDerived("other", b);
    s.forget("voice-embedding");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(s.has("other")).toBe(true);
  });

  it("re-registering a key disposes the previous value (no leaks)", () => {
    const s = new SensorSession({ getUserMedia: null });
    const first = vi.fn();
    s.registerDerived("voice-embedding", first);
    s.registerDerived("voice-embedding", vi.fn());
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("marks unsupported when getUserMedia is absent and never throws", async () => {
    const s = new SensorSession({ getUserMedia: null });
    expect(await s.acquire("mic")).toBeNull();
    expect(s.state("mic")).toBe("unsupported");
  });

  it("records permission errors without throwing", async () => {
    const s = new SensorSession({ getUserMedia: async () => { throw new Error("denied by user"); } });
    expect(await s.acquire("camera")).toBeNull();
    expect(s.state("camera")).toBe("error");
    expect(s.error("camera")).toBe("denied by user");
  });

  it("stopAll is safe to call twice", async () => {
    const s = new SensorSession({ getUserMedia: async () => fakeStream() });
    await s.acquire("camera");
    s.stopAll();
    expect(() => s.stopAll()).not.toThrow();
  });
});

describe("release(kind)", () => {
  it("stops only that sensor's tracks and keeps the other active", async () => {
    const cam = fakeStream();
    const mic = fakeStream();
    const session = new SensorSession({
      getUserMedia: async (c) => (c.video ? cam : mic)
    });
    await session.acquire("camera");
    await session.acquire("mic");
    session.release("mic");
    for (const t of mic.tracks) expect(t.stop).toHaveBeenCalled();
    for (const t of cam.tracks) expect(t.stop).not.toHaveBeenCalled();
    expect(session.state("mic")).toBe("stopped");
    expect(session.state("camera")).toBe("active");
    expect(session.stream("mic")).toBeNull();
  });

  it("is idempotent on an idle slot", () => {
    const session = new SensorSession({ getUserMedia: null });
    expect(() => session.release("mic")).not.toThrow();
    expect(session.state("mic")).toBe("idle");
  });
});
