import type { ReliabilityBin } from "@loki/engine";

export function calibrationSvg(
  bins: ReliabilityBin[],
  title = "LOKI calibration (simulator)",
  size = 340
): string {
  const pad = 44;
  const plot = size - pad * 2;
  const x = (v: number) => pad + v * plot;
  const y = (v: number) => size - pad - v * plot;
  const points = bins
    .filter((b) => b.count > 0)
    .map((b) => `${x(b.meanConfidence).toFixed(1)},${y(b.accuracy).toFixed(1)}`)
    .join(" ");
  const bars = bins
    .filter((b) => b.count > 0)
    .map(
      (b) =>
        `<rect x="${x(b.lower).toFixed(1)}" y="${pad}" width="${(plot / bins.length).toFixed(1)}" height="${plot}" fill="#c9a25e" opacity="0.08"/>`
    )
    .join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (t) =>
        `<line x1="${x(t)}" y1="${pad}" x2="${x(t)}" y2="${size - pad}" stroke="#29403b" stroke-width="1"/>` +
        `<line x1="${pad}" y1="${y(t)}" x2="${size - pad}" y2="${y(t)}" stroke="#29403b" stroke-width="1"/>` +
        `<text x="${x(t)}" y="${size - pad + 16}" fill="#8fa39d" font-size="9" text-anchor="middle">${t.toFixed(2)}</text>` +
        `<text x="${pad - 8}" y="${y(t) + 3}" fill="#8fa39d" font-size="9" text-anchor="end">${t.toFixed(2)}</text>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${title}">
  <rect width="${size}" height="${size}" fill="#07110f"/>
  ${bars}
  ${ticks}
  <line x1="${pad}" y1="${size - pad}" x2="${size - pad}" y2="${pad}" stroke="#55706a" stroke-dasharray="4 4" stroke-width="1"/>
  <polyline points="${points}" fill="none" stroke="#e8dfcc" stroke-width="2"/>
  ${bins
    .filter((b) => b.count > 0)
    .map(
      (b) =>
        `<circle cx="${x(b.meanConfidence).toFixed(1)}" cy="${y(b.accuracy).toFixed(1)}" r="4" fill="#d4553d"/>`
    )
    .join("")}
  <text x="${size / 2}" y="${pad - 18}" fill="#e8dfcc" font-family="Georgia, serif" font-size="13" text-anchor="middle">${title}</text>
  <text x="${size / 2}" y="${size - 8}" fill="#8fa39d" font-size="9" text-anchor="middle">mean confidence</text>
</svg>`;
}
