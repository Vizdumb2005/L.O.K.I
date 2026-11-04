# Safe demo plan - The Countdown with a live Oracle voice

Status (2026-11-04): SUPERSEDED as the default route. The user directed the
Puter.js route instead (WhatsApp, 2026-11-04 evening): meta/muse-spark-open via
Puter's User-Pays model needs no keys, no redemption, and no spend of ours, and
it is now the integrated default (see README "Optional live voice"). This Modal
plan remains parked, unapproved, and unexecuted - no spend, no endpoint
creation, no redemption. Original text follows.

Status: plan. No spend, no endpoint creation, no redemption until the user's
approval lands. Approval asked: fill the verified Modal credit-redemption
form with exact reviewed fields, then up to $3 of awarded credits for
text-only conductor testing.

## Route (chosen, pending approval): Modal Shared Endpoint

Grounded against Modal's own docs (not Baseten's):

- Shared Endpoints are OpenAI-compatible: Chat Completions at
  `https://inference.us-west.modal.direct/v1`, model = the endpoint's
  hostname. Auth: proxy token as `Authorization: Bearer wk-<id>.ws-<secret>`
  (modal.com/docs/guide/endpoints).
- Billing is per token at the listed model rates
  ($1.25 / $0.15 cached / $4.25 per MTok for Muse Spark Open,
  modal.com/library/meta/muse-spark-open). "Credits included with your plan
  cannot be used for Shared Endpoint usage" (shared-endpoints guide) - plan
  credits don't apply; HACKATHON EVENT credits are a separate credit class.
  Whether the event award covers Shared Endpoint usage is verified AFTER
  redemption from the account's credit view and, if ambiguous, a single
  bounded probe call. No inference from plan-credit rules.
- Modal spend limits cap NET out-of-pocket charges after credits; when
  reached, Modal stops workloads that would incur out-of-pocket charges
  (modal.com/docs/guide/budgets). The workspace has NO payment method, so
  out-of-pocket collection has no card to charge regardless.
- Concurrency is model-limited with HTTP 429 + backoff; the conductor is
  single-flight per spectator, far under any limit.

## Pre-spend verification sequence (after approval)

1. Fill the redemption form with exactly the reviewed fields. Any changed
   terms or new disclosures stop the flow and come back for authority.
2. Create the Shared Endpoint for Muse Spark Open and a proxy token
   (account actions required to use the credits; token goes to the vault,
   never the repo, never the client).
3. Verify the awarded credit class covers Shared Endpoint usage from the
   account's Usage/Credits view.
4. Set a workspace spend limit of $0 out-of-pocket if the dashboard allows
   (defense in depth; account change - confirmed with the user first).
5. Reservation policy on this route (regrounded 11-04, second pass):
   credits are money and the $3 test budget is a HARD cap, so a call may
   only run when its worst case is provably within the remaining ledger
   balance. Modal publishes per-token rates ($1.25 in / $0.15 cached /
   $4.25 out per Mtok, modal.com/docs/guide/supported-models) and a
   1M-token context (modal.com/library/meta/muse-spark-open), and
   advertises an OpenAI-compatible Chat Completions API
   (modal.com/docs/guide/endpoints.md) - but NO published max-output
   bound and no per-parameter billing guarantee. A raw context bound
   (~1M output tokens worst case, ~$4.25) exceeds the cap, and
   reconcile-after-the-call is NOT protection against a first overspend.
   Therefore: after endpoint + proxy-token creation, the FIRST call is
   the free read-only GET /v1/models metadata probe to capture the
   server's own reported limits. Real calls proceed only if that
   metadata (or other Modal-owned documentation) yields a per-call
   worst case that fits under the $3 cap with the reservation ledger;
   otherwise the route reports "cannot bound within $3" and holds. We
   still send max_tokens=140 on every call as cheap insurance, but it
   is never treated as the bound. Input is bounded by our own byte
   ceiling (provable from the payload). The $0 out-of-pocket spend
   limit (step 4) is defense in depth for cash, never a substitute for
   the credit bound.
6. Only then: conductor test calls, each reserved against the $3 cumulative
   ledger ceiling.

## Hosting the voice for visitors

- Local/demo video: proxy on 127.0.0.1, scripted or live voice from the
  developer machine. Public Pages visitors get the scripted voice by
  default - nothing is sent anywhere.
- Operator-hosted mode (the only hosted mode currently built): the proxy
  runs where the operator runs it (localhost or an operator tunnel). The
  ORACLE_TOKEN is entered by the operator at runtime and is NEVER shipped in
  the frontend bundle - a public Pages build carries no endpoint URL and no
  token, so visitors always get the scripted voice.
- Public hosted launch (NOT authorized, NOT built): would need per-visitor
  scoped server sessions (a shared token in a public bundle is no auth at
  all; CORS is not auth) plus a server-side global budget kill. The guard's
  cumulative ledger already provides global drain denial - reservations
  refuse at the $3 ceiling no matter how many clients call; per-IP rate
  limiting alone could not. Do not call the endpoint public-ready without
  the session design.
- The badge reads "words written live by Muse Spark Open" - text only; no
  TTS exists and none is implied.

## Claims discipline

- The act is arithmetic plus a model-voiced conductor. Copy never says or
  implies Meta/Muse does the prediction.
- "words written live by Muse Spark Open" renders only on lines the model
  actually produced (voice=model); scripted lines carry no badge.
- On any mismatch the seal is opened as an owned miss.
