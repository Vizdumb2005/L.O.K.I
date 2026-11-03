/**
 * Blueprint v4 §2.2 — the disguised attunement calibration.
 *
 * A least-squares affine map from raw iris offsets (source, from MediaPipe
 * landmarks) to screen pixels (target, the ember anchor points). The map is
 * fitted in one pass over the collected samples and gated on its residual:
 * an RMSE above ~120px means this device's gaze signal is not good enough to
 * open the gaze channel, and the show continues without it.
 */

export interface Point {
  x: number;
  y: number;
}

export interface AffineSample {
  source: Point;
  target: Point;
}

export interface AffineMap {
  /** 2x2 linear part: [a11, a12; a21, a22] as rows. */
  a11: number;
  a12: number;
  a21: number;
  a22: number;
  /** Translation. */
  tx: number;
  ty: number;
}

/**
 * Solve the 6x6 normal equations for the affine least-squares fit.
 * Returns null when the system is degenerate (too few or collinear samples).
 */
export function fitAffineMap(samples: AffineSample[]): AffineMap | null {
  if (samples.length < 3) return null;

  // Design matrix rows: [sx, sy, 1, 0, 0, 0] -> tx, [0, 0, 0, sx, sy, 1] -> ty.
  // Normal equations: (A^T A) coef = A^T b, 6 unknowns
  // [a11, a12, txT, a21, a22, tyT] in that order for x and y independently is
  // NOT separable because a11..a22 are shared - so solve the joint 6x6 system.
  const ata: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  const atb = new Array<number>(6).fill(0);
  for (const s of samples) {
    const { x: sx, y: sy } = s.source;
    const { x: tx, y: ty } = s.target;
    const rowX = [sx, sy, 1, 0, 0, 0];
    const rowY = [0, 0, 0, sx, sy, 1];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        ata[i]![j]! += rowX[i]! * rowX[j]! + rowY[i]! * rowY[j]!;
      }
      atb[i]! += rowX[i]! * tx + rowY[i]! * ty;
    }
  }

  // Gaussian elimination with partial pivoting.
  const n = 6;
  const m = ata.map((row, i) => [...row, atb[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-9) return null; // degenerate system
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const d = m[col]![col]!;
    for (let r = col + 1; r < n; r++) {
      const f = m[r]![col]! / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  const coef = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let acc = m[r]![n]!;
    for (let c = r + 1; c < n; c++) acc -= m[r]![c]! * coef[c]!;
    coef[r] = acc / m[r]![r]!;
  }

  return {
    a11: coef[0]!,
    a12: coef[1]!,
    tx: coef[2]!,
    a21: coef[3]!,
    a22: coef[4]!,
    ty: coef[5]!
  };
}

export function applyAffineMap(map: AffineMap, source: Point): Point {
  return {
    x: map.a11 * source.x + map.a12 * source.y + map.tx,
    y: map.a21 * source.x + map.a22 * source.y + map.ty
  };
}

/** RMS residual of the fit, in the target's units (screen pixels). */
export function affineRmse(map: AffineMap, samples: AffineSample[]): number {
  if (samples.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (const s of samples) {
    const p = applyAffineMap(map, s.source);
    sum += (p.x - s.target.x) ** 2 + (p.y - s.target.y) ** 2;
  }
  return Math.sqrt(sum / samples.length);
}
