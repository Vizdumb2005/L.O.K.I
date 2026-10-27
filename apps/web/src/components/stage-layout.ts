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
