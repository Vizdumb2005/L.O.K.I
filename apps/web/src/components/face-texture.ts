import * as THREE from "three";
import { cardPalette } from "./stage-layout.js";

export function hash(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Card face textures are created imperatively and passed to r3f via props, so
 * r3f never auto-disposes them. Without an explicit dispose, every act entry
 * and every remount leaks about 1.5 MB of GPU memory per card (512x716 RGBA),
 * which compounds across repeated shows in one session.
 */
const liveFaceTextures = new Set<THREE.Texture>();

export function createFaceTexture(label: string, glyph: string, index: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 716;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    liveFaceTextures.add(fallback);
    return fallback;
  }

  const palette = cardPalette(glyph, label);

  const gradient = ctx.createLinearGradient(0, 0, 512, 716);
  gradient.addColorStop(0, palette.tintTop);
  gradient.addColorStop(0.55, palette.tintMid);
  gradient.addColorStop(1, palette.tintBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 716);

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 468, 672);
  ctx.strokeStyle = palette.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(38, 38, 436, 640);

  ctx.fillStyle = palette.label;
  ctx.font = "600 30px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.fillText(glyph, 52, 78);
  ctx.textAlign = "right";
  ctx.fillText(glyph, 460, 662);

  ctx.fillStyle = "rgba(70, 54, 28, 0.55)";
  ctx.font = "500 16px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("LOKI · THE OBSERVATORY", 256, 72);

  ctx.textAlign = "center";
  ctx.fillStyle = palette.glyph;
  ctx.font = "500 230px Georgia, 'Times New Roman', serif";
  ctx.fillText(glyph, 256, 360);

  ctx.fillStyle = palette.label;
  ctx.font = "italic 32px Georgia, 'Times New Roman', serif";
  const words = label.split(" ");
  if (words.length > 2) {
    ctx.fillText(words.slice(0, 2).join(" "), 256, 540);
    ctx.fillText(words.slice(2).join(" "), 256, 578);
  } else {
    ctx.fillText(label, 256, 558);
  }

  ctx.fillStyle = "rgba(67, 51, 25, 0.55)";
  ctx.font = "500 16px 'Courier New', monospace";
  ctx.fillText(`NO. ${String(index + 1).padStart(2, "0")}`, 256, 646);

  ctx.strokeStyle = palette.rule;
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const y = 100 + hash(i + index * 13) * 520;
    ctx.beginPath();
    ctx.moveTo(48 + hash(i * 3) * 120, y);
    ctx.lineTo(464 - hash(i * 5) * 120, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  liveFaceTextures.add(texture);
  return texture;
}

/** Disposes a live face texture once; repeat calls are a no-op. */
export function disposeFaceTexture(texture: THREE.Texture): void {
  if (liveFaceTextures.delete(texture)) {
    texture.dispose();
  }
}

/** Test hook: number of face textures created but not yet disposed. */
export function liveFaceTextureCount(): number {
  return liveFaceTextures.size;
}
