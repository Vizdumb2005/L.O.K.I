/**
 * Claim safety is a core concern, not an effect's choice.
 * These patterns are intentionally narrow enough not to ban stage language such as
 * "illusion", "mentalism", "I don't know", or "you beat me".
 */
export const BANNED_CLAIM_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "mind-reading", pattern: /\b(mind[- ]?read(ing|er)?|read(ing)? (your|their|his|her|someone'?s) mind|telepath(y|ic)|psychic)\b/i },
  { id: "lie-detection", pattern: /\b(lie[- ]?detect(ion|or|ing)?|detect(ing|s)? (a )?lie|truth serum|polygraph)\b/i },
  { id: "emotion-reading", pattern: /\b(emotion[- ]?read(ing)?|read(ing)? (your|their|his|her) emotions?|micro[- ]?expression)\b/i },
  { id: "diagnosis", pattern: /\b(diagnos(e|is|ing)|medical condition|mental (illness|disorder)|disorder)\b/i },
  { id: "guarantee", pattern: /\b(100\s*%|guarantee(d|s)?|never (wrong|miss(es)?)|always (right|correct)|infallible)\b/i },
  { id: "world-first", pattern: /\b(world'?s first|first (ever|in the world)|never been done)\b/i },
  { id: "brain-scan", pattern: /\b(brain[- ]?(scan|wave)|neural scan|scan(n?ing)? your brain|analyse your brain)\b/i },
  { id: "certainty-claim", pattern: /\b(I know (exactly )?what you('| a)?re thinking|I know everything about you|your face reveals)\b/i },
  { id: "supernatural", pattern: /\b(supernatural|paranormal|sixth sense|clairvoyan(t|ce))\b/i },
  { id: "scientific-proof", pattern: /\b(scientifically proven|science proves|proves? I can)\b/i }
];

export function findBannedClaim(text: string): string | null {
  // Explicit disclaimers are honest, not claims. Remove only the disclaimer clause,
  // then test the rest of the sentence for assertions.
  const withoutDisclaimers = text.replace(
    /\b(?:is|are|was|were|it'?s)?\s*(?:not|never|no)\s+(?:a\s+|an\s+|real\s+|actual\s+)?(?:mind[- ]?reading|telepathy|psychic|lie[- ]?detection|emotion[- ]?reading|diagnosis|guarantee|guaranteed)\b/gi,
    " "
  );
  for (const { id, pattern } of BANNED_CLAIM_PATTERNS) {
    if (pattern.test(withoutDisclaimers)) return id;
  }
  return null;
}
