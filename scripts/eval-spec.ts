import type { CellSpec } from "@loki/sim";
import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";

export const RUNS = 1000;
export const SEED = 20261027;
export const NOISE = [0, 0.05, 0.15, 0.3] as const;
export const POLICIES = ["greedy", "median", "fixed"] as const;

export const EVAL_SPECS: CellSpec[] = [];
type AddOverrides = Omit<CellSpec, "runs" | "seed" | "gaze" | "force"> &
  Partial<Pick<CellSpec, "gaze" | "force">>;
function add(label: string, overrides: AddOverrides): void {
  EVAL_SPECS.push({ runs: RUNS, seed: SEED, gaze: false, force: false, ...overrides, label });
}

for (const effect of [cardEffect, exampleEffect]) {
  for (const policy of POLICIES) {
    for (const noise of NOISE) {
      add(`${effect.id} / ${policy} / noise ${noise}`, {
        label: `${effect.id} / ${policy} / noise ${noise}`,
        effect,
        policy,
        answerError: noise
      });
    }
  }
}

// Shipping configuration: card, greedy, nominal 10% answer error.
add("card / shipping / noise 0.1", {
  label: "card / shipping / noise 0.1",
  effect: cardEffect,
  policy: "greedy",
  answerError: 0.1
});

// Toy effect at the same nominal condition, to show the plugin contract is exercised.
add("example / shipping / noise 0.1", {
  label: "example / shipping / noise 0.1",
  effect: exampleEffect,
  policy: "greedy",
  answerError: 0.1
});

const ablationBase = {
  effect: cardEffect,
  policy: "greedy" as const,
  answerError: 0.15
};

add("ablation / soft + outlier", { label: "ablation / soft + outlier", ...ablationBase });
add("ablation / hard elimination", {
  label: "ablation / hard elimination",
  ...ablationBase,
  hardMode: true,
  useOutlier: false
});
add("ablation / no outlier", {
  label: "ablation / no outlier",
  ...ablationBase,
  useOutlier: false
});
add("ablation / gaze on (simulated)", {
  label: "ablation / gaze on (simulated)",
  ...ablationBase,
  gaze: true,
  gazeAccuracy: 0.65,
  gazeReliability: 0.65
});
add("ablation / force on (prior shift)", {
  label: "ablation / force on (prior shift)",
  ...ablationBase,
  force: true
});
add("ablation / temperature 0.95", {
  label: "ablation / temperature 0.95",
  effect: { ...cardEffect, config: { ...cardEffect.config, temperature: 0.95 } },
  policy: "greedy",
  answerError: 0.15
});
add("ablation / temperature 1.05", {
  label: "ablation / temperature 1.05",
  effect: { ...cardEffect, config: { ...cardEffect.config, temperature: 1.05 } },
  policy: "greedy",
  answerError: 0.15
});
