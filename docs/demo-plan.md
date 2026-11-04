# Safe demo plan - The Countdown with a live Oracle voice

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
5. Empirical bound check: one call with max_tokens=64; require
   usage.completion_tokens <= 64 before trusting the guard's reservation
   arithmetic on THIS route. Baseten's documented cap semantics do not
   automatically bind Modal.
6. Only then: conductor test calls, each reserved against the $3 cumulative
   ledger ceiling.

## Hosting the voice for visitors

- Local/demo video: proxy on 127.0.0.1, scripted or live voice from the
  developer machine. Public Pages visitors get the scripted voice by
  default - nothing is sent anywhere.
- Public hosted mode (not yet authorized): the proxy must sit on a hosted
  server the user approves (candidate: a Modal web endpoint, keeping the
  whole route inside the approved workspace). Requirements already
  implemented: ORACLE_TOKEN shared secret (401 otherwise), single-origin
  CORS allow-list, per-IP rate limit, body size cap, honesty-filtered
  output, fail-closed budget guard, and the spectator opt-in gate in the
  stage. The API key/proxy token lives only in server env, never in the
  Pages bundle (bundle grep-verified clean).

## Claims discipline

- The act is arithmetic plus a model-voiced conductor. Copy never says or
  implies Meta/Muse does the prediction.
- "performed live by Muse Spark Open" renders only on lines the model
  actually produced (voice=model); scripted lines carry no badge.
- On any mismatch the seal is opened as an owned miss.
