export interface CardPalette {
  glyph: string;
  label: string;
  rule: string;
  border: string;
  tintTop: string;
  tintMid: string;
  tintBottom: string;
  isRedSuit: boolean;
}

/** Suit and elemental ink palette for 3D and flat stage cards. */
export function cardPalette(glyph: string, label: string): CardPalette {
  const text = `${glyph} ${label}`;
  if (/[♥♦]|Heart|Diamond/i.test(text)) {
    return {
      glyph: "#9e2a2b",
      label: "#6e1519",
      rule: "rgba(158, 42, 43, 0.25)",
      border: "rgba(158, 42, 43, 0.52)",
      tintTop: "#f7eee8",
      tintMid: "#efe0d6",
      tintBottom: "#e2cec1",
      isRedSuit: true
    };
  }
  if (/☉|Sun/i.test(text)) {
    return {
      glyph: "#b85d14",
      label: "#5c300b",
      rule: "rgba(184, 93, 20, 0.25)",
      border: "rgba(160, 82, 18, 0.5)",
      tintTop: "#f7eed8",
      tintMid: "#ede0be",
      tintBottom: "#dfd0a6",
      isRedSuit: false
    };
  }
  if (/☽|Moon/i.test(text)) {
    return {
      glyph: "#24435c",
      label: "#192e40",
      rule: "rgba(36, 67, 92, 0.24)",
      border: "rgba(36, 67, 92, 0.48)",
      tintTop: "#eaeff2",
      tintMid: "#dce4e9",
      tintBottom: "#cbd6dd",
      isRedSuit: false
    };
  }
  if (/☄|Comet/i.test(text)) {
    return {
      glyph: "#a6341b",
      label: "#591d10",
      rule: "rgba(166, 52, 27, 0.24)",
      border: "rgba(166, 52, 27, 0.48)",
      tintTop: "#f6ebe2",
      tintMid: "#eadbcf",
      tintBottom: "#dcc8b8",
      isRedSuit: true
    };
  }
  if (/❀|Flower/i.test(text)) {
    return {
      glyph: "#8f2947",
      label: "#4f1728",
      rule: "rgba(143, 41, 71, 0.24)",
      border: "rgba(143, 41, 71, 0.48)",
      tintTop: "#f5e9ec",
      tintMid: "#ead9de",
      tintBottom: "#dcc6cd",
      isRedSuit: true
    };
  }
  return {
    glyph: "#16231f",
    label: "rgba(22, 35, 31, 0.92)",
    rule: "rgba(95, 74, 39, 0.28)",
    border: "rgba(64, 52, 32, 0.45)",
    tintTop: "#f4ead7",
    tintMid: "#e8dcc4",
    tintBottom: "#d9c9ab",
    isRedSuit: false
  };
}

/** Center the reveal before its perspective lift, independent of the shuffled grid slot. */
export function cardTargetPosition(
  base: { x: number; y: number; z: number },
  highlighted: boolean,
  drift: number,
  revealPulse: number
): { x: number; y: number; z: number } {
  return highlighted
    ? { x: 0, y: 0.35, z: 2.1 + revealPulse * 0.15 }
    : { x: base.x, y: base.y + drift, z: base.z };
}

/** Fit row count to the actual camera frustum, not desktop width alone. */
export function stageGridScale(width: number, worldHeight: number, rows: number): number {
  return Math.min(1.06, Math.max(0.56, width / 980), worldHeight * 0.82 / (rows * 1.98 + 0.4));
}
