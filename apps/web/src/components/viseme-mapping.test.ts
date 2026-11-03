import { describe, expect, it } from "vitest";
import { computeVisemesFromFft, SynthVisemeDriver } from "../lib/use-avatar-driver.js";

function createSyntheticFft(
  dominantBand: "low" | "mid" | "high" | "silence",
  nBins = 256
): Float32Array {
  const fft = new Float32Array(nBins);
  // Default noise floor at -80 dB
  fft.fill(-80);

  if (dominantBand === "low") {
    // 100 Hz to 800 Hz (bins 1 to 9 at 44100 Hz, 512 FFT)
    for (let i = 1; i <= 9; i++) fft[i] = -12;
  } else if (dominantBand === "mid") {
    // 750 Hz to 1600 Hz (bins 9 to 19)
    for (let i = 9; i <= 19; i++) fft[i] = -10;
  } else if (dominantBand === "high") {
    // 2200 Hz to 4500 Hz (bins 26 to 52)
    for (let i = 26; i <= 52; i++) fft[i] = -10;
  }

  return fft;
}

describe("Viseme Mapping & Acoustic Articulation (F15)", () => {
  it("rejects silence below the noise floor (rms <= 0.015)", () => {
    const silenceFft = createSyntheticFft("silence");
    const visemes = computeVisemesFromFft(silenceFft, 44100, 0.01);

    expect(visemes.jawOpen).toBe(0);
    expect(visemes.mouthWide).toBe(0);
    expect(visemes.mouthRound).toBe(0);
  });

  it("extracts dominant jawOpen on low-frequency acoustic energy (vowels /a/, /ɑ/)", () => {
    const lowFft = createSyntheticFft("low");
    const visemes = computeVisemesFromFft(lowFft, 44100, 0.15);

    expect(visemes.jawOpen).toBeGreaterThan(0.4);
    // Low band does not heavily trigger high sibilants
    expect(visemes.mouthWide).toBeLessThan(0.3);
  });

  it("extracts dominant mouthWide on high-formant frequencies (sibilants /s/, /z/, /i/)", () => {
    const highFft = createSyntheticFft("high");
    const visemes = computeVisemesFromFft(highFft, 44100, 0.16);

    expect(visemes.mouthWide).toBeGreaterThan(0.3);
  });

  it("extracts mouthRound on mid-formant frequencies (rounded vowels /u/, /o/)", () => {
    const midFft = createSyntheticFft("mid");
    const visemes = computeVisemesFromFft(midFft, 44100, 0.15);

    expect(visemes.mouthRound).toBeGreaterThan(0.3);
    // Rounded lips attenuate wide spreading
    expect(visemes.mouthWide).toBeLessThan(0.2);
  });

  it("SynthVisemeDriver generates continuous 4.2 Hz rhythmic speech oscillations during cues", () => {
    const driver = new SynthVisemeDriver();
    expect(driver.isActive()).toBe(false);

    // Idle yields silence
    expect(driver.sample().rms).toBe(0);

    // Active delivery
    driver.start();
    expect(driver.isActive()).toBe(true);

    const s0 = driver.sample(0.0);
    const s1 = driver.sample(0.06); // ~quarter period peak opening
    const s2 = driver.sample(0.24); // full syllable cycle

    expect(s0.rms).toBeGreaterThan(0.15);
    expect(s1.rms).toBeGreaterThan(0.15);
    expect(s2.rms).toBeGreaterThan(0.15);
    expect(s0.visemes.jawOpen).not.toBe(s1.visemes.jawOpen);
    expect(s1.visemes.jawOpen).toBeGreaterThan(s0.visemes.jawOpen);

    driver.stop();
    expect(driver.isActive()).toBe(false);
    expect(driver.sample().rms).toBe(0);
  });
});
