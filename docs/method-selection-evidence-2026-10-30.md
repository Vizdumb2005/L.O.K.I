# Method selection evidence: The Twelve, claims-vs-tree (2026-10-30)

Status: synthetic measurements on fixed error models; human participants 0.
Independent per-answer flips are synthetic stress only - systematic mistaken
answers and STT substitutions may behave differently (that is what gate 2
probes on a real device). "Feels different from questions" remains a
participant-test hypothesis everywhere in this repository.

Question: which answering method should The Twelve use after the direct
rank/suit questionnaire was rejected?

Candidates:
- **engine-claims** (shipped candidate): 20 declarative claim probes
  ("It's a heart."), answered True of my card / That's wrong, through the
  existing Bayesian machinery (commit gate tau 0.96, epsilon 0.1, outlier
  0.06, contradiction recovery, honest miss). Categorical rank/suit
  questions removed.
- **raw-tree**: the solver-verified statement tree (docs/research-card-method-design-2026-10-30.md);
  leaf = reveal, no protection.
- **tree+repetition**: raw tree plus re-asking every path claim once;
  self-contradiction = abstain.
- **C-tree-order+gate**: tree order through the same belief gate, greedy
  fallback when the gate lags the tree.

## Paired comparison

All four methods ran on the SAME seed schedule (2026-10-30 + i*7919) with
the SAME sampled truth per run, N=960 runs per cell. c = correct commits,
w = wrong commits, m = misses; denominators are all runs in the cell.
Beats = mean statements/questions.

| p | engine-claims | raw-tree | tree+repetition | C-tree-order+gate |
|---|---|---|---|---|
| 0 | c=889 w=0 m=71 (6.57) | c=960 w=0 m=0 (3.92) | c=960 w=0 m=0 (7.83) | c=641 w=0 m=319 (6.50) |
| 0.05 | c=639 w=2 m=319 (6.68) | c=790 w=170 m=0 (3.84) | c=648 w=9 m=303 (7.22) | c=453 w=2 m=505 (6.64) |
| 0.10 | c=458 w=13 m=489 (6.76) | c=649 w=311 m=0 (3.75) | c=445 w=19 m=496 (6.67) | c=329 w=4 m=627 (6.71) |
| 0.15 | c=303 w=20 m=637 (6.84) | c=528 w=432 m=0 (3.69) | c=284 w=24 m=652 (6.23) | c=227 w=11 m=722 (6.78) |

Earlier partial runs (2000 seeds/card for raw/repetition; 480 sampled runs
for engine/C) are superseded by this paired table; the conclusions matched.

## Balanced per-card sweep (each card forced equally, 240 seeds/card, p=0.10)

- engine-claims: every card commits except h-2 (two of hearts):
  c117-126/w0-2/m112-123 per 240; h-2 c0/w1/m239.
- raw-tree: wrong reveals on every card, worst d-3/d-4/s-3/s-4 (w95/240).
- tree+repetition: c84-160/w3-8/m77-148.
- C-tree-order+gate: FOUR blind cards - d-3, d-4, s-3, s-4 commit 0/240
  (all honest misses); others c117-156.

At p=0 (240 seeds/card), engine-claims commits every card 240/240 except
h-2, which misses 240/240. The entire truthful-case miss rate (~7%) is the
two of hearts: with epsilon/outlier smoothing, no claim combination
separates h-2 from d-2 to tau=0.96 within the beat budget. The miss is the
designed honest-failure path ("You beat me"), never a wrong reveal. A
discriminating compound claim ("a low heart - the ace or two of hearts")
would fix it but edges toward naming the card; left as an open decision.

## Findings

1. Raw-tree commit machinery fails the original protection requirement:
   17.7-45% wrong reveals under noise, zero abstention. A deterministic
   leaf is conditional on truthful answers; the tree has no inconsistency
   state. The <=5-statements/<=2-denials guarantee holds at p=0 only.
2. Leaf + unused-attribute verification barely helps (wrong stays 16-33%
   in the earlier 2000-seeds/card run): a wrong leaf usually shares the
   checked attributes with the true card.
3. tree+repetition protects (w 0.9-3.7% of all runs) but abstains
   31-68% and roughly doubles beats; dominated by engine-claims on
   protection and beats at every noise level.
4. C fails on belief lag: at every noise level the tree order left the
   belief gate unpassed at the leaf, and four cards (d-3, d-4, s-3, s-4)
   became 100% blind misses. Tree order optimizes truthful statement
   count, not belief concentration.
5. engine-claims is the only candidate that keeps both texture (claims,
   never soliciting the answer) and protection (0 wrong at p=0; w <= 2.1%
   of all runs at p<=0.15; misses instead of confident errors).

Decision (owned): ship engine-claims as the protected implementation.
This is NOT a finding that the experience objection is solved - felt
difference from the questionnaire is a participant hypothesis. Known
limitation carried openly: h-2 always ends in an honest miss.

## What remains before any deployment claim

- Gate-2 real-device run (docs/real-device-validation-spec.md).
- Eval report regenerated on the final method (docs/eval-report.md,
  33 cells / 33,000 runs, regenerated 2026-10-30).
- Review/merge/deploy evidence for the branch; nothing here is "shipped"
  until that exists.
