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

At p=0 (240 seeds/card), engine-claims committed every card 240/240
except h-2, which missed 240/240. The entire truthful-case miss rate (~7%)
was the two of hearts. The miss was the designed honest-failure path ("You
beat me"), never a wrong reveal. Root cause and the measured remedy are in
the next section; as of the heart-even remedy below, the p=0 sweep is
240/240 commits on all twelve cards.

## h-2 remedy (2026-10-30, measured): "An even heart" compound claim

Diagnosis (posterior trajectory and per-probe information gain at the
recovery state, truthful h-2 run, seed 20261027): after six good picks
(low-half, even, warm-colour, heart, two, diamond) the posterior caps at
0.9219 with the remaining mass spread over four rivals (d-2, s-2, h-a,
h-4 at ~0.0185 each). No single remaining claim lifts the top past 0.94
(best measured: odd, +0.018), because each claim contradicts only one
rival and the epsilon/outlier smoothing bounds the per-claim likelihood
ratio. The defect is aggregate evidence, not probe selection: IG-ranked
selection was already picking near-optimal probes.

Remedy: one new compound claim parallel in form to the existing two-card
compounds (heart-high, diamond-low, red-ace, spade-high):

- heart-even: "An even heart - the two or the four." (heart AND even rank:
  true for h-2 and h-4, false for h-a, d-2, s-2). It contradicts three of
  the four residual rivals at once and is picked by the unchanged greedy
  IG policy on its own (trace: chosen at beat 5 of the h-2 path).

Protections unchanged: tau=0.96, epsilon/outlier smoothing, abstention
path, beat budget 6+1, no card-naming compound (suit+rank together), no
near-explicit question.

Measured outcome (balanced sweep, 240 seeds/card, same seed schedule as
above):

- p=0: all twelve cards c240/w0/m0. h-2 fixed (was c0/w0/m240).
- p=0.10: c116-125/w0-2/m113-123 per card; h-2 c116/w1/m123 - inside the
  same family range as every other card, no blind spot and no wrong-commit
  hotspot. meanBeats 6.00-7.00 (unchanged profile).
- Regenerated full eval (33 cells / 33,000 runs, docs/eval-report.md):
  shipping cell 535/1000 commits with 6 wrong-of-all at p=0.10 (was
  496/1000 with 6 wrong before the remedy; commits rose because h-2 can
  now commit). Gate PASS unchanged - a behavioral floor, not zero-error
  evidence.

An earlier uncommitted attempt (a low-heart compound) measured no change
and was reverted without a preserved root cause; the IG instrumentation
above shows a probe whose likelihood does not vary across cards has
exactly zero information gain and is never picked, the likely defect in
that attempt. The shipped probe is defined on the same Card predicates as
the other compounds and is covered by the contract test (21 claims).

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
