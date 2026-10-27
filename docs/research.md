# LOKI v3 research log

Research was done before product code. Each section records the question, the sources
actually opened, what they say, how it changed the design, and confidence. Numbers are
reported as the sources report them. A study-specific rate is never used as a guarantee.

Research date: 2026-10-27. Deadline verified the same day.

---

## 1. Noisy twenty questions / noisy adaptive search

**Question.** Is there a Bayes-optimal policy for noisy yes/no questioning, and does a
posterior-median or bisection policy beat greedy entropy for a small categorical set?
What happens with wrong answers?

**Sources opened**

- B. Jedynak, P. I. Frazier, R. Sznitman, "Twenty Questions with Noise: Bayes Optimal
  Policies for Entropy Loss", *Journal of Applied Probability* 49(1):114–136, 2012.
  DOI 10.1239/jap/1331216837. Full text read.
- C.-K. Chung, B. M. Sadler, L. Zheng, A. O. Hero, "Unequal Error Protection Querying
  Policies for the Noisy 20 Questions Problem", arXiv:1606.09233; *IEEE Transactions on
  Information Theory*, 2017. Abstract and introduction read.

**What they actually say**

- Jedynak et al. formulate noisy 20 questions as a dynamic program with entropy loss.
  They prove that any policy maximising the expected one-step reduction in entropy is
  also optimal over the full horizon (Theorems 1 and 2).
- The probabilistic-bisection / posterior-median policy is a special case. It is optimal
  when the target is one-dimensional, questions are interval queries, and the answer
  channel has a particular symmetric form. The paper is explicit about those conditions;
  it does not claim median beats entropy for an arbitrary finite categorical set.
- The second paper studies *non-adaptive* query sets with unequal error protection. Its
  guarantees do not transfer directly to a short adaptive categorical quiz.

**Design impact**

- Ship greedy expected information gain, penalised by reveal cost, as policy A.
- Keep posterior-median/bisection as challenger B only. It is not assumed to be better.
- Keep a fixed scripted sequence as control C.
- At N=12 items, the theoretical entropy difference between sensible policies is small;
  the empirical simulator decides. Results are in `docs/eval-report.md`.
- Model wrong answers softly. The literature optimises under a known noise channel; our
  channel is unknown, non-stationary and human, so we add an outlier mixture and a
  recovery state rather than trusting the channel.

**Confidence.** High for the theorem and its conditions; medium for how much any policy
difference will matter at N=12.

---

## 2. Webcam gaze in the browser

**Question.** Can a browser webcam support item-level or even coarse-zone gaze evidence?
What are the real error figures, including adverse conditions?

**Sources opened**

- A. Papoutsaki, P. Sangkloy, J. Laskey, N. Butler, J. Huang, "WebGazer: Scalable Webcam
  Eye Tracking Using User Interactions", IJCAI 2016, pp. 3093–3099.
  <https://www.ijcai.org/proceedings/2016/0540.pdf>. Full text read.
- E. Psarra, V. Krassanakis, A. Kesidis, "Systematic Performance Evaluation of WebGazer
  Webcam-Based Eye Tracking with Spatial and Angular Error Analysis", *Journal of Eye
  Movement Research* 19(5):99, 2026. DOI 10.3390/jemr19050099. Full text read.
- Google, "Face Landmarker" (MediaPipe Tasks), <https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker>.
  Documentation read.
- Google, "Iris" (MediaPipe), <https://ai.google.dev/edge/mediapipe/solutions/vision/iris>.
  Documentation read.
- Meta, "SAM 3.1" overview, <https://ai.meta.com/sam3/>. Overview read.
- WebGazer repository and paper page, <https://webgazer.cs.brown.edu/>; WebGazer source
  documentation, <https://github.com/brownhci/WebGazer>.

**What they actually say**

- **WebGazer 2016:** 76 online participants plus 4 in-lab participants. Mean error was
  175 px (ridge regression, click tasks) and 210 px (other conditions); mean visual angle
  4.17°. Online participants could move freely. The authors present this as feasibility,
  not high-precision eye tracking.
- **JEMR 2026:** 20 participants, 20 runs each (380 total), one laptop, stable indoor
  lighting, instructions to keep the head still. Mean spatial error ranged from 1009 to
  1383 device pixels; mean angular error from 10.322° to 13.556° across tested conditions.
  Denser calibration grids were associated with lower error. The study reports descriptive
  differences; it did not run a formal repeated-measures significance test. It names
  uncontrolled head movement, lighting variation, glasses, and a single device as limits.
- The two results do not agree on a single number. That disagreement is the finding:
  browser gaze error is setup-dependent and can be an order of magnitude worse than a
  lab tracker.
- **MediaPipe Face Landmarker** returns 478 3D face landmarks, 52 blendshapes, and facial
  transformation matrices. **MediaPipe Iris** adds 10 iris landmarks (indices after 468)
  and explicitly says it does not infer gaze location. Iris landmarks are features, not a
  calibrated gaze estimate.
- **SAM 3.1** is promptable segmentation and tracking. It is not a gaze estimator and is
  not assigned a gaze role.
- **Adverse conditions:** I did not find a controlled browser study that isolates glasses,
  low light, and head motion with reported angular error. The 2026 study was deliberately
  head-still and stable-light and still reported 10–13.6°. The 2016 study allowed motion
  and reported 4.17° with a different protocol. Therefore the honest statement is that
  adverse-condition error is *unquantified here and expected to be worse*, not that a
  specific figure is known.
- **Newer in-browser models:** no peer-reviewed, validated replacement for WebGazer was
  found that reports lower error under ordinary laptop webcams. MediaPipe provides face
  geometry, not a validated screen-gaze regressor.

**Design impact**

- At a 60 cm viewing distance, 10° subtends about 10.5 cm. A playing card is about 6 cm
  wide and adjacent cards are separated by less than 2 cm. Even 4.17° is about 4.4 cm.
  Item-level gaze is not credible. Even quadrants are doubtful at 10–13°.
- The gaze adapter therefore outputs a screen **zone** plus a reliability score, never an
  item. The effect's channel binding maps zones to hypotheses. Frames are aggregated into
  windows; per-frame likelihoods are never multiplied as if independent.
- The gaze evidence contribution is capped. The show must work with zero gaze.
- **Ship decision:** the gaze lab is implemented and unit-tested, but the show ships with
  gaze **off** and the camera released. No human calibration validation was possible in
  this build, so turning it on by default would violate the spec's own gate. The camera
  path remains available as an explicit, local-only lab.
- No camera frames are uploaded or stored. The model runs in the browser; only zone,
  reliability, and timestamp would ever enter the evidence log.

**Confidence.** High that item-level webcam gaze is unsupported; high that default-off is
the honest choice; medium on the exact zone-level error for any particular user.

---

## 3. Mentalism and forcing psychology

**Question.** How strong are verbal priming, visual forcing, and equivoque? What sample
sizes and conditions produced the measured effects?

**Sources opened**

- A. Pailhès, G. Kuhn, "Influencing choices with conversational primes: How a magic trick
  unconsciously influences card choices", *PNAS* 117(30):17675–17679, 2020.
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC7395500/>. Full text read.
- N. Shalom, A. C. Schnall, M. G. H. Coles, D. T. Levin, "Choosing in freedom or forced to
  choose? Introspective blindness to psychological forcing in stage-magic", *PLoS ONE*
  8(3):e58254, 2013. <https://pubmed.ncbi.nlm.nih.gov/23516455/>. Full text read.
- A. Pailhès, V. Kumari, G. Kuhn, "The magician's choice: Providing illusory choice and
  sense of agency with the equivoque forcing technique", *Journal of Experimental
  Psychology: General* 150(7):1358–1372, 2021. DOI 10.1037/xge0000929. Full text read.
- The 2020 and 2021 papers' supplementary/sample descriptions were checked for N and
  conditions.

**What they actually say**

- **Conversational primes (PNAS 2020):** N=90. In the mental-priming condition, 17.8%
  chose the target 3♦; 38.9% chose some three; 33.3% chose some diamond. The no-prime
  control had 0/23 choose 3♦. Live and video performances did not differ significantly.
  The authors describe a modest bias, not control.
- **Visual/classical force (PLoS ONE 2013):** N=31. A visual force produced 45% target
  selection; a classical force produced 54%. Participants showed introspective blindness
  about being forced. Small sample, specific setup.
- **Equivoque (JEP:General 2021):** Experiment 1 N=101, Experiment 2 N=50 (target 46
  powered), Experiment 3 N=84. Equivoque produced high rates of the intended outcome and
  a strong sense of agency. It is an outcome force built from successive choices, not a
  probabilistic inference channel; the papers do not give a universal hit rate.
- All three are context-dependent stage effects. None supports "98%" or "100%" claims.

**Design impact**

- Forces are optional **prior shifts** with logging, not assumptions. The card effect
  includes 3♦ and can shift its prior when the force experiment is explicitly enabled.
- Because no human pilot was possible, the force remains **default off** in the show. The
  simulator can test the mechanical consequence of a prior shift, but that is not evidence
  that the psychological force works.
- Equivoque-style language is used only as question-bank craft where it also partitions
  the hypothesis set. It is not modelled as a separate "mind control" channel.
- UI and README say "illusion" and "mentalism"; they never quote a study rate as a promise.

**Confidence.** High for the reported numbers and their modest size; high that they do not
generalise to a guaranteed target.

---

## 4. Computational magic / AI mentalism prior art

**Question.** What computer-performed guessing or mentalism systems already exist? Can we
claim a world first?

**Sources opened**

- "Akinator", Wikipedia (accessed 2026-10-27), with references to Elokence, Vice, and the
  Washington Post. <https://en.wikipedia.org/wiki/Akinator>.
- "20Q", Wikipedia (accessed 2026-10-27), with references to Robin Burgener, the Goddard
  Space Flight Center colloquium, and the 2005 patent applications.
  <https://en.wikipedia.org/wiki/20Q>.
- Akinator official site, <https://en.akinator.com/> (product page).
- 20Q official site, <http://www.20q.net/>.

**What they actually say**

- **20Q** began in 1988 as an AI experiment by Robin Burgener, became a Radica handheld in
  2003, and asks yes/no/unknown/sometimes questions. It uses an artificial neural network
  to choose questions and guesses; the patent application is "Artificial neural network
  guessing method and game" (US 2006/230008 A1, 2005 priority).
- **Akinator** launched in 2007 (Elokence). It asks yes/no/probably/probably not/don't know
  questions to guess a character, object, film, or animal, learns from past players, and
  asks up to roughly 25 questions. Its implementation is proprietary; public descriptions
  place it in statistical classification/expert-system territory. No peer-reviewed
  accuracy study was found.
- These are inference/guessing games. They are prior art for adaptive question selection,
  not for a consent-based performance engine with calibrated uncertainty and a stage.
- I found no peer-reviewed published computer-performed mentalism act with a validated
  hit rate. Absence of evidence is not proof of absence, especially across commercial and
  amateur magic. Therefore: **no "world first" claim**.

**Design impact**

- Position LOKI as a reusable performance engine and an honest illusion, not as the first
  computer mentalist.
- Cite Akinator/20Q as prior art in the README and demo. The novelty is the architecture,
  calibration/recovery contract, and privacy stance — not the idea of a guessing computer.

**Confidence.** High for the two systems' public history; medium for the negative prior-art
search, which cannot cover every commercial magic product.

---

## 5. Meta models, event rules, and tooling

**Question.** Which Meta models and routes are actually available, and what do the event
rules require?

**Sources opened**

- Cerebral Valley event page, "Meta Global AI Developer Hackathon",
  <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details> (saved page and JSON
  metadata read 2026-10-27).
- Baseten model cookbook, <https://www.baseten.co/blog/> and the Muse Spark model page
  linked from the event material. The exact route was checked in the cookbook text.
- Meta AI model overview, <https://ai.meta.com/> (Muse Spark / SAM links).
- SAM 3.1 overview, <https://ai.meta.com/sam3/>.

**What they actually say**

- The event page names the Muse Spark series, Muse Wonder, Muse Image, Glimmer, SAM 3.1,
  SAM 3, and "any other Meta AI products identified on the Event page". Baseten offers
  credits and higher rate limits for selected participants.
- The verified Baseten route is:
  - base URL `https://inference.baseten.co/v1`
  - model `meta-models/muse-spark-open`
  - Muse Spark Open is a sparse MoE with 816B total / 42B active parameters, a 1,048,576
    token context, text/image/audio/video input, text output, and coding/agentic focus.
  - Baseten list pricing at the time of research: $1.25 per 1M input tokens and $4.25 per
    1M output tokens.
- The spec's proposed `meta-models/muse-spark-open-1026` was **not found**. Documentation
  uses the non-dated ID. The build uses the non-dated ID.
- **SAM 3.1 is segmentation/tracking, not gaze.** It is not used for gaze. It could be a
  future stage/asset tool, but that is roadmap only.
- **Rules:** original work required; open-source components allowed if their licenses are
  followed; the entrant retains ownership and grants the organizer a broad license;
  incomplete/false information can disqualify. Judging: Impact 30%, Use of Meta AI Tooling
  25%, Technical Depth & Execution 20%, Demo 25%.
- **Public repo and demo video:** the event page does not state an explicit public-repo
  requirement or a required demo-video format in the sections read. Treat both as
  `[UNRESOLVED]`; the repository is still written to be public-ready, and the video script
  follows the spec's 3-minute shape.

**Design impact**

- The default build spends $0: templates only, no network calls. The optional patter
  rewrite is gated behind an explicit proxy and environment key; it degrades to templates.
- The optional integration uses the verified model ID and base URL. It sends only a
  structured beat/tone/claim payload. It never receives camera data or belief state.
- No SAM gaze role. No claim that Meta tooling improves inference accuracy.
- Because "Use of Meta AI Tooling" is 25% of judging, the optional route and the honest
  offline story are documented prominently; we do not fake usage or spend.

**Confidence.** High for the route/price/context; high for the judging weights; medium for
whether an unlisted model alias also works; low for unstated submission-format rules.

---

## 6. Deadline and submission window

**Question.** What is the exact deadline in the builder's timezone?

**Sources opened**

- Cerebral Valley event page JSON:
  `hackathonSubmissionDueDate: "2026-11-05 02:00:00"`; event `endDateTime:
  "2026-11-05 02:00:00"`; page copy: "Nov 4: Project submissions due by 9:00 PM ET";
  `submissionDueDateGracePeriodHours: 6`.
- Timezone conversion checked manually.

**What it says**

- **Deadline: 2026-11-05 02:00 UTC**, which is **2026-11-04 21:00 US Eastern** and
  **2026-11-05 07:30 India Standard Time**.
- The platform has a 6-hour grace field. We do not rely on it; the internal target is
  **2026-11-03 18:00 UTC**, leaving buffer for recording and submission friction.
- The exact submission portal fields and whether a public repo URL/demo URL is mandatory
  are `[UNRESOLVED]`.

**Design impact.** Scope is cut to the core + card + toy effect. No speculative effects.
The demo script is written early enough to record on Nov 2–3.

---

## 7. Claims rejected or downgraded

| Claim | Status | Reason |
|---|---|---|
| "98% / 100% hit rate" | Rejected | No source; forcing studies show modest, context-dependent effects. |
| "Reads your mind" | Rejected | False; product is an illusion. |
| "Detects lies / emotions / diagnoses" | Rejected | Not built, not measured, ethically out of scope. |
| 667-person card-naming prior | Rejected | Could not verify; not used. |
| "2017 AI trick succeeded in ~90% of 143 shows" | Rejected | Could not verify; not used. |
| SAM 3.1 as gaze estimator | Rejected | Segmentation/tracking model, not gaze. |
| "World's first AI mentalist" | Rejected | Akinator/20Q and commercial magic are prior art; absence not proven. |
| Gaze supports item-level resolution | Rejected | 4.17° best case, 10–13.6° in 2026 study; cards are too small. |
| Gaze improves the show | Unproven | No human validation in this build; default off. |
| Forces improve the show | Unproven | No human pilot; default off. |
| Public repo/demo format required | Unresolved | Not stated in the event page sections read. |

---

## 8. Human pilot status

No human participants were available to this build. The repository therefore reports
**0 human participants**, not a fabricated pilot. `docs/eval-report.md` contains the
simulator results and an explicit external-validity warning. `docs/ethics.md` contains the
protocol and consent language for running a pilot later. The demo may show the presenter
as a consenting performer, but that is a demo, not a measured study, and is labeled as
such.
