import { describe, expect, it } from "vitest";
import { PerformanceSession } from "../packages/showrunner/src/session.js";
import { cardEffect } from "../effects/card/src/index.js";
import { CARD_PROBES, CARD_FORCE_TARGET } from "../effects/card/src/cards.js";

describe("Milestone 3 Iteration 2 Challenger M3-4 Empirical Stress Suite", () => {
  const cardProbeIds = new Set(CARD_PROBES.map((p) => p.id));

  it("Suite 1: Baseline 100-Trial Equivocation Sweep with Affirmative Beat 2 ('yes')", () => {
    const trialsCount = 100;
    const stats = {
      uncalibrated: { count: 0, le2Beats: 0, cardProbeLeaks: 0, recoveryOrMiss: 0, minPost: 1.0 },
      droppedGaze: { count: 0, le2Beats: 0, cardProbeLeaks: 0, recoveryOrMiss: 0, minPost: 1.0 },
      acceptedGaze: { count: 0, le2Beats: 0, cardProbeLeaks: 0, recoveryOrMiss: 0, minPost: 1.0 }
    };

    for (let trial = 0; trial < trialsCount; trial++) {
      const seed = 2000 + trial;
      const isUncalibrated = trial < 50;
      const reliability = isUncalibrated ? 0 : 0.10 + (trial - 50) * (0.39 / 49);

      const session = new PerformanceSession(cardEffect, {
        seed,
        cameraEnabled: true,
        cameraValidated: !isUncalibrated,
        presenceEnabled: true
      });

      session.begin();
      session.chosen();

      const stage = session.stage;
      const zones = stage.zones!;
      const targetZone = zones[trial % zones.length]!.id;

      if (!isUncalibrated) {
        session.addGaze({ zone: targetZone, reliability });
      }
      session.finishAttune();

      // Beat 1
      expect(session.phaseName).toBe("probe");
      const p1 = session.snapshot().probeId;
      expect(p1).toBe("card-equivocation-gesture");

      session.answer("cast-black");
      session.clearAck();

      // Beat 2
      let p2: string | undefined;
      let beats = 1;
      if (session.phaseName === "probe") {
        p2 = session.snapshot().probeId;
        beats = 2;
        session.answer("yes");
        session.clearAck();
      }

      const conf = session.internal().confidence;
      const phase = session.phaseName;

      let bucket: "uncalibrated" | "droppedGaze" | "acceptedGaze";
      if (isUncalibrated) bucket = "uncalibrated";
      else if (reliability < 0.35) bucket = "droppedGaze";
      else bucket = "acceptedGaze";

      stats[bucket].count++;
      if (p2 && cardProbeIds.has(p2)) stats[bucket].cardProbeLeaks++;
      if (phase === "recover" || phase === "miss") stats[bucket].recoveryOrMiss++;
      if (["build", "reveal"].includes(phase) && beats <= 2) stats[bucket].le2Beats++;
      if (conf < stats[bucket].minPost) stats[bucket].minPost = conf;
    }

    console.log("=== SUITE 1 (Affirmative 'yes') RESULTS ===");
    console.table(stats);

    expect(stats.uncalibrated.count).toBe(50);
    expect(stats.droppedGaze.count).toBe(32);
    expect(stats.acceptedGaze.count).toBe(18);

    expect(stats.uncalibrated.le2Beats).toBe(50);
    expect(stats.droppedGaze.le2Beats).toBe(32);
    expect(stats.acceptedGaze.le2Beats).toBe(18);

    expect(stats.uncalibrated.cardProbeLeaks).toBe(0);
    expect(stats.droppedGaze.cardProbeLeaks).toBe(0);
    expect(stats.acceptedGaze.cardProbeLeaks).toBe(0);

    expect(stats.uncalibrated.recoveryOrMiss).toBe(0);
    expect(stats.droppedGaze.recoveryOrMiss).toBe(0);
    expect(stats.acceptedGaze.recoveryOrMiss).toBe(0);
  });

  it("Suite 2: Adversarial Denial Pivot Sweep across all 100 trials ('no' on Beat 2)", () => {
    const trialsCount = 100;
    const stats = {
      uncalibrated: { count: 0, le2Beats: 0, cardProbeLeaks: 0, recoveryOrMiss: 0, minPost: 1.0, pivotCues: 0 },
      droppedGaze: { count: 0, le2Beats: 0, cardProbeLeaks: 0, recoveryOrMiss: 0, minPost: 1.0, pivotCues: 0 },
      acceptedGaze: { count: 0, le2Beats: 0, cardProbeLeaks: 0, recoveryOrMiss: 0, minPost: 1.0, pivotCues: 0 }
    };

    for (let trial = 0; trial < trialsCount; trial++) {
      const seed = 3000 + trial;
      const isUncalibrated = trial < 50;
      const reliability = isUncalibrated ? 0 : 0.10 + (trial - 50) * (0.39 / 49);

      const session = new PerformanceSession(cardEffect, {
        seed,
        cameraEnabled: true,
        cameraValidated: !isUncalibrated,
        presenceEnabled: true
      });

      session.begin();
      session.chosen();

      const stage = session.stage;
      const zones = stage.zones!;
      const targetZone = zones[trial % zones.length]!.id;

      if (!isUncalibrated) {
        session.addGaze({ zone: targetZone, reliability });
      }
      session.finishAttune();

      // Beat 1
      expect(session.phaseName).toBe("probe");
      session.answer("cast-black");
      session.clearAck();

      // Beat 2 - Denial pivot test
      let p2: string | undefined;
      let beats = 1;
      if (session.phaseName === "probe") {
        p2 = session.snapshot().probeId;
        beats = 2;
        session.answer("no");
        session.clearAck();
      }

      const conf = session.internal().confidence;
      const phase = session.phaseName;
      const cues = session.snapshot().cues;
      const hasPivotCue = cues.some((c) => c.id === "denial-pivot" || c.line?.includes("Wait—"));

      let bucket: "uncalibrated" | "droppedGaze" | "acceptedGaze";
      if (isUncalibrated) bucket = "uncalibrated";
      else if (reliability < 0.35) bucket = "droppedGaze";
      else bucket = "acceptedGaze";

      stats[bucket].count++;
      if (p2 && cardProbeIds.has(p2)) stats[bucket].cardProbeLeaks++;
      if (phase === "recover" || phase === "miss") stats[bucket].recoveryOrMiss++;
      if (["build", "reveal"].includes(phase) && beats <= 2) stats[bucket].le2Beats++;
      if (conf < stats[bucket].minPost) stats[bucket].minPost = conf;
      if (hasPivotCue) stats[bucket].pivotCues++;

      // In uncalibrated, denial pivot must reveal "h-a"
      if (isUncalibrated) {
        expect(session.internal().revealedId).toBe("h-a");
      }
    }

    console.log("=== SUITE 2 (Adversarial Denial 'no') RESULTS ===");
    console.table(stats);

    expect(stats.uncalibrated.count).toBe(50);
    expect(stats.droppedGaze.count).toBe(32);
    expect(stats.acceptedGaze.count).toBe(18);

    expect(stats.uncalibrated.le2Beats).toBe(50);
    expect(stats.droppedGaze.le2Beats).toBe(32);
    expect(stats.acceptedGaze.le2Beats).toBe(18);

    expect(stats.uncalibrated.cardProbeLeaks).toBe(0);
    expect(stats.droppedGaze.cardProbeLeaks).toBe(0);
    expect(stats.acceptedGaze.cardProbeLeaks).toBe(0);

    expect(stats.uncalibrated.recoveryOrMiss).toBe(0);
    expect(stats.droppedGaze.recoveryOrMiss).toBe(0);
    expect(stats.acceptedGaze.recoveryOrMiss).toBe(0);

    // Posterior must exceed commit threshold (0.60)
    expect(stats.uncalibrated.minPost).toBeGreaterThanOrEqual(0.60);
    expect(stats.droppedGaze.minPost).toBeGreaterThanOrEqual(0.60);
    expect(stats.acceptedGaze.minPost).toBeGreaterThanOrEqual(0.60);

    // Denial pivot cue presence
    expect(stats.uncalibrated.pivotCues).toBe(50);
    expect(stats.droppedGaze.pivotCues).toBe(32);
    expect(stats.acceptedGaze.pivotCues).toBe(18);
  });

  it("Suite 3: Equivocation Option Invariance ('keep-crimson', 'yes', 'no' on Beat 1)", () => {
    const beat1Options = ["keep-crimson", "yes", "no"] as const;

    for (const opt of beat1Options) {
      for (let s = 1; s <= 20; s++) {
        const session = new PerformanceSession(cardEffect, {
          seed: s * 10,
          cameraEnabled: true,
          cameraValidated: false
        });

        session.begin();
        session.chosen();
        session.finishAttune();

        expect(session.snapshot().probeId).toBe("card-equivocation-gesture");
        session.answer(opt);
        session.clearAck();

        expect(session.snapshot().probeId).toBe("card-equivocation-secondary");
        session.answer("yes");
        session.clearAck();

        expect(session.phaseName).toBe("build");
        expect(session.internal().revealedId).toBe(CARD_FORCE_TARGET);
        expect(session.internal().answered).toBe(2);
      }
    }
  });

  it("Suite 4: Zone Invariance for Black Card Zones under Low-Reliability Gaze", () => {
    // Test across all 6 zones and 5 seeds to verify black card zones do not cause contradiction
    for (let seed = 1; seed <= 10; seed++) {
      const template = new PerformanceSession(cardEffect, { seed });
      const stage = template.stage;
      const zones = stage.zones!;

      for (const zone of zones) {
        for (const ans of ["yes", "no"] as const) {
          const session = new PerformanceSession(cardEffect, {
            seed,
            cameraEnabled: true,
            cameraValidated: true
          });
          session.begin();
          session.chosen();
          // Dropped gaze on this zone (rel = 0.25)
          session.addGaze({ zone: zone.id, reliability: 0.25 });
          session.finishAttune();

          expect(session.snapshot().probeId).toBe("card-equivocation-gesture");
          session.answer("cast-black");
          session.clearAck();

          expect(session.snapshot().probeId).toBe(`zone-statement-${zone.id}`);
          session.answer(ans);
          session.clearAck();

          expect(session.phaseName).toBe("build");
          expect(session.internal().answered).toBe(2);
          expect(session.internal().confidence).toBeGreaterThanOrEqual(0.60);
        }
      }
    }
  });

  it("Suite 5: Calibrated Camera but Zero Gaze Windows (Spectator Looked Away)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const session = new PerformanceSession(cardEffect, {
        seed,
        cameraEnabled: true,
        cameraValidated: true
      });
      session.begin();
      session.chosen();
      // 0 gaze windows provided
      session.finishAttune();

      expect(session.snapshot().probeId).toBe("card-equivocation-gesture");
      session.answer("cast-black");
      session.clearAck();

      expect(session.snapshot().probeId).toBe("card-equivocation-secondary");
      session.answer("yes");
      session.clearAck();

      expect(session.phaseName).toBe("build");
      expect(session.internal().revealedId).toBe(CARD_FORCE_TARGET);
      expect(session.internal().answered).toBe(2);
    }
  });

  it("Suite 6: Extremely Low Gaze Reliability (rel < 0.10, e.g. 0.05)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const ans of ["yes", "no"] as const) {
        const session = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true
        });
        session.begin();
        session.chosen();
        session.addGaze({ zone: "top-left", reliability: 0.05 });
        session.finishAttune();

        expect(session.snapshot().probeId).toBe("card-equivocation-gesture");
        session.answer("cast-black");
        session.clearAck();

        // With rel < 0.10, gaze is completely ignored, so secondary probe is used
        expect(session.snapshot().probeId).toBe("card-equivocation-secondary");
        session.answer(ans);
        session.clearAck();

        expect(session.phaseName).toBe("build");
        expect(session.internal().revealedId).toBe(ans === "yes" ? CARD_FORCE_TARGET : "h-a");
        expect(session.internal().answered).toBe(2);
      }
    }
  });
});
