# The model's role in The Countdown (honest spec)

Status: design, not yet implemented. No real-model call is made until the
billing-bound guard is verified against a live route and the wallet scope is
approved.

## What the model is

Muse Spark Open (text-only) plays **the Oracle's voice**: the live conductor of
the act. The deterministic engine (effects/countdown) remains the entire
method; the model never decides the outcome, never sees hidden state, and is
never presented as reading a mind.

## What the model actually does (real interaction, not decoration)

1. **Live conduction.** At every beat (seal display, number invitation, deal,
   count, reveal, miss), the model receives the *actual* trace state - phase,
   named number, cards counted so far, produced card, seal outcome - and
   generates the spoken conduction for that exact state. A spectator naming 17
   at 11pm gets different words than one naming 10, because the input differs.
2. **Free-form spectator dialogue.** Between beats the spectator can address
   the Oracle. The model answers in persona under hard system constraints:
   - never claims to read, sense, or influence thoughts;
   - if asked directly whether thoughts are read, answers truthfully (no);
   - never reveals the method unprompted; if the spectator insists, the voice
     points at the "How it works" panel rather than lying.
3. **Owned-miss voice.** On a seal mismatch, the model performs the miss as an
   owned miss from the real trace - produced vs sealed, no smoothing over.

## Honest fallback

If the model route is unavailable, unbudgeted, or errors, every beat falls
back to scripted static lines. The trace records `voice: "model" | "script"`
per line, and the UI shows "performed live by Muse Spark Open" **only** for
lines the model actually produced. A scripted show is never dressed as a live
one.

## Billing bound (grounded 2026-11-04)

Exact source quotations:

- docs.baseten.co/inference/model-apis/reasoning: "max_tokens caps the whole
  completion, reasoning tokens included." and "Baseten includes reasoning
  tokens in completion_tokens and counts them toward your total usage and
  billing." (The `reasoning.max_tokens` param is a SEPARATE per-request control
  that only DeepSeek V4 Flash 0731 enforces; other models ignore THAT param.
  The top-level `max_tokens` cap is what bounds billing.)
- docs.baseten.co/reference/inference-api/chat-completions: "max_tokens ...
  Required range: 1 <= x <= 262144" (server-enforced output ceiling), and "If
  your request input plus max_tokens exceeds the model's context length,
  max_tokens is truncated."
- dev.meta.ai/docs/reasoning: "Reasoning tokens count toward both your
  output-token limit and billed completion tokens."

So every call is provably bounded client-side:

    worst_case($) = input_bytes * $1.25/1M  (byte-level BPE: tokens <= bytes)
                  + max_tokens  * $4.25/1M

With conduction prompts (~2KB) and max_tokens 600, one beat costs <= $0.005.
The guard (scripts/llm-budget.ts) reserves this bound per call against a
cumulative persisted ledger; the $3 cap is enforceable. The earlier $4.42
figure assumed no output cap and is retired.

## What the model is not

- Not evidence, not sensing, not inference about the spectator.
- Not "Meta-powered prediction". The prediction is arithmetic; the model is
  the performer talking. Demo copy must say exactly that.
