import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFaceTexture,
  disposeFaceTexture,
  hash,
  liveFaceTextureCount
} from "./face-texture.js";

// Node environment has no DOM; a 2d-less canvas stub exercises the fallback
// path, which is enough to verify the texture lifecycle contract.
const realDocument = globalThis.document;

beforeEach(() => {
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => null
    })
  } as unknown as Document;
});

afterEach(() => {
  globalThis.document = realDocument;
});

describe("face texture lifecycle", () => {
  it("tracks created textures as live", () => {
    const before = liveFaceTextureCount();
    const texture = createFaceTexture("Ace of Spades", "A♠", 0);
    expect(liveFaceTextureCount()).toBe(before + 1);
    disposeFaceTexture(texture);
    expect(liveFaceTextureCount()).toBe(before);
  });

  it("disposes the GPU texture on release", () => {
    const texture = createFaceTexture("Two of Hearts", "2♥", 3);
    let disposed = false;
    texture.addEventListener("dispose", () => {
      disposed = true;
    });
    disposeFaceTexture(texture);
    expect(disposed).toBe(true);
  });

  it("ignores double disposal of the same texture", () => {
    const texture = createFaceTexture("Comet", "☄", 1);
    let disposeCount = 0;
    texture.addEventListener("dispose", () => {
      disposeCount += 1;
    });
    disposeFaceTexture(texture);
    disposeFaceTexture(texture);
    expect(disposeCount).toBe(1);
  });

  it("disposal of one texture leaves the others live", () => {
    const before = liveFaceTextureCount();
    const a = createFaceTexture("Flower", "✿", 0);
    const b = createFaceTexture("Moon", "☾", 1);
    disposeFaceTexture(a);
    expect(liveFaceTextureCount()).toBe(before + 1);
    disposeFaceTexture(b);
    expect(liveFaceTextureCount()).toBe(before);
  });
});

describe("hash", () => {
  it("is deterministic and stays inside [0, 1)", () => {
    for (let seed = 0; seed < 500; seed++) {
      const value = hash(seed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(hash(seed)).toBe(value);
    }
  });
});
